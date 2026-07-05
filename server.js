const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'questions.json');
const OPENTDB_BASE = 'https://opentdb.com';

let writeQueue = Promise.resolve();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function ensureFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]', 'utf8');
  }
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchTriviaQuestionByCategoryName(name) {
  const resCats = await fetch(`${OPENTDB_BASE}/api_category.php`);
  const catsData = await resCats.json();
  const categories = catsData.trivia_categories || [];

  const lowered = String(name || '').trim().toLowerCase();

  const match =
    categories.find((c) => c.name.toLowerCase() === lowered) ||
    categories.find((c) => c.name.toLowerCase().includes(lowered)) ||
    categories.find((c) => lowered.includes(c.name.toLowerCase())) ||
    null;

  if (!match) {
    const err = new Error('No matching Open Trivia DB category found.');
    err.code = 404;
    throw err;
  }

  const resQ = await fetch(`${OPENTDB_BASE}/api.php?amount=1&type=multiple&category=${match.id}`);
  const qData = await resQ.json();

  if (!resQ.ok || !Array.isArray(qData.results) || !qData.results.length) {
    const err = new Error('No trivia question returned.');
    err.code = resQ.status || 500;
    throw err;
  }

  const q = qData.results[0];
  const correct = decodeHtml(q.correct_answer);
  const incorrect = (q.incorrect_answers || []).map(decodeHtml);
  const answers = [correct, ...incorrect].slice(0, 4);

  if (answers.length !== 4) {
    const err = new Error('Trivia source did not return 4 answers.');
    err.code = 500;
    throw err;
  }

  return {
    question: decodeHtml(q.question),
    answers,
    sourceCategory: match.name
  };
}

async function generateWithOpenRouter(category) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENROUTER_API_KEY is not configured on the server.');
    err.code = 500;
    throw err;
  }

  const prompt = `Create one multiple-choice quiz item for the category: ${category}. Return valid JSON only with keys question and answers. answers must be an array of exactly 4 short strings, and the first answer must be the correct one. Do not include markdown or explanation.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'openrouter/free',
      messages: [
        { role: 'system', content: 'You generate concise quiz questions as strict JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data?.error?.message || 'AI generation failed.');
    err.code = response.status;
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error('AI response was empty.');
    err.code = 500;
    throw err;
  }

  const cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!parsed.question || !Array.isArray(parsed.answers) || parsed.answers.length !== 4) {
    const err = new Error('AI response format was invalid.');
    err.code = 500;
    throw err;
  }

  return {
    question: String(parsed.question).trim(),
    answers: parsed.answers.map((a) => String(a).trim()).slice(0, 4)
  };
}

async function readQuestions() {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error('questions.json must contain a JSON array');
  }

  return data.map((item, index) => ({
    id: item.id || `legacy-${index + 1}`,
    category: item.category || '',
    question: item.question || '',
    answers: Array.isArray(item.answers) ? item.answers : []
  }));
}

async function writeQuestions(questions) {
  const normalized = questions.map((item) => ({
    category: String(item.category || '').trim(),
    question: String(item.question || '').trim(),
    answers: Array.isArray(item.answers)
      ? item.answers.map((a) => String(a || '').trim()).filter(Boolean)
      : []
  }));

  await fs.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

function enqueueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

function validateQuestion(body) {
  const errors = [];

  if (!body || typeof body !== 'object') errors.push('Payload must be an object.');
  if (!String(body.category || '').trim()) errors.push('Category is required.');
  if (!String(body.question || '').trim()) errors.push('Question is required.');

  const answers = Array.isArray(body.answers)
    ? body.answers.map((a) => String(a || '').trim()).filter(Boolean)
    : [];

  if (answers.length !== 4) errors.push('Exactly four answers are required.');

  return { errors, answers };
}

app.get('/api/questions', async (req, res) => {
  try {
    const questions = await readQuestions();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions', async (req, res) => {
  const { errors, answers } = validateQuestion(req.body);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const created = await enqueueWrite(async () => {
      const questions = await readQuestions();
      const item = {
        category: String(req.body.category).trim(),
        question: String(req.body.question).trim(),
        answers
      };
      questions.push(item);
      await writeQuestions(questions);
      return item;
    });

    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/questions/:id', async (req, res) => {
  const { errors, answers } = validateQuestion(req.body);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const updated = await enqueueWrite(async () => {
      const questions = await readQuestions();
      const index = questions.findIndex((q) => q.id === req.params.id);

      if (index === -1) {
        const err = new Error('Question not found.');
        err.code = 404;
        throw err;
      }

      questions[index] = {
        ...questions[index],
        category: String(req.body.category).trim(),
        question: String(req.body.question).trim(),
        answers
      };

      await writeQuestions(questions);
      return questions[index];
    });

    res.json(updated);
  } catch (error) {
    res.status(error.code || 500).json({ error: error.message });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await enqueueWrite(async () => {
      const questions = await readQuestions();
      const next = questions.filter((q) => q.id !== req.params.id);

      if (next.length === questions.length) {
        const err = new Error('Question not found.');
        err.code = 404;
        throw err;
      }

      await writeQuestions(next);
    });

    res.status(204).send();
  } catch (error) {
    res.status(error.code || 500).json({ error: error.message });
  }
});

app.post('/api/questions/generate', async (req, res) => {
  const category = String(req.body?.category || '').trim();
  if (!category) return res.status(400).json({ error: 'Category is required.' });

  try {
    const generated = await generateWithOpenRouter(category);
    res.json({ category, ...generated });
  } catch (error) {
    res.status(error.code || 500).json({ error: error.message });
  }
});

app.post('/api/questions/trivia', async (req, res) => {
  const category = String(req.body?.category || '').trim();
  if (!category) return res.status(400).json({ error: 'Category is required.' });

  try {
    const trivia = await fetchTriviaQuestionByCategoryName(category);
    res.json({
      category,
      question: trivia.question,
      answers: trivia.answers,
      sourceCategory: trivia.sourceCategory
    });
  } catch (error) {
    res.status(error.code || 500).json({ error: error.message });
  }
});

app.get('/api/questions/download', async (req, res) => {
  try {
    await ensureFile();
    res.download(DATA_FILE, 'questions.json');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/meta', async (req, res) => {
  try {
    const questions = await readQuestions();
    const categories = [...new Set(questions.map((q) => q.category).filter(Boolean))].sort();
    res.json({
      count: questions.length,
      categories,
      dataFile: DATA_FILE
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Questions editor running at http://localhost:${PORT}`);
  console.log(`Using data file: ${DATA_FILE}`);
});
