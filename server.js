const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'questions.json');
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

async function readQuestions() {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('questions.json must contain a JSON array');
  return data.map((item, index) => ({
    id: item.id || `legacy-${index + 1}`,
    category: item.category || '',
    question: item.question || '',
    answers: Array.isArray(item.answers) ? item.answers : []
  }));
}

async function writeQuestions(questions) {
  const normalized = questions.map((item) => ({
    id: item.id || crypto.randomUUID(),
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
  const answers = Array.isArray(body.answers) ? body.answers.map((a) => String(a || '').trim()).filter(Boolean) : [];
  if (answers.length === 0) errors.push('At least one answer is required.');
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
        id: crypto.randomUUID(),
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
    res.json({ count: questions.length, categories, dataFile: DATA_FILE });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Questions editor running at http://localhost:${PORT}`);
  console.log(`Using data file: ${DATA_FILE}`);
});
