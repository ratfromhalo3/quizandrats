# Questions JSON Editor

A retro-styled browser editor for managing quiz questions, generating new prompts, fetching Open Trivia DB questions, and pulling random *Who Wants to Be a Millionaire?* questions from a local JSON file.

## What it does

- Browse, search, and filter questions from the existing API-backed question set.
- Create, edit, duplicate, and delete questions in the editor UI.
- Generate new questions with AI using the currently selected category.
- Fetch trivia questions from Open Trivia DB using the chosen category.
- Load a random Millionaire question from `millionaire_questions.json`.
- Navigate the built-in music playlist with previous and next buttons.

## Recent updates

### Millionaire loader

- Supports both `prizelevel` and `prize_level`.
- Supports both `correctanswer` and `correct_answer`.
- Keeps the current editor category when the **Random millionaire** button is used.
- Places the correct answer first when filling the four answer fields.

### Trivia fetching

- Adds fuzzy category assistance for Open Trivia DB lookups.
- Suggests likely matching trivia categories when an exact match fails.
- Retries with a best-match category alias for broader terms such as movie, anime, maths, football, or gaming.
- Preserves the original category in the form if a fuzzy trivia retry succeeds.

### Playlist controls

- Adds **Prev** and **Next** buttons for playlist navigation.
- Updates the visible track name after changing tracks.
- Re-enables music playback automatically when moving between tracks.

## Expected files

Place these files together in the same app folder:

- `index.html`
- `millionaire_questions.json`
- Any API/server files already used by `/api/questions`, `/api/questions/trivia`, and related routes

## Notes

- If the app appears unchanged after replacing `index.html`, do a hard refresh to clear the cached script.
- If Open Trivia DB still cannot find a category, try a broader label such as `General Knowledge`, `History`, `Film`, `Sports`, or `Science & Nature`.
- If the Millionaire button fails, confirm that `millionaire_questions.json` is available beside the HTML file and contains `question`, `options`, and a correct-answer field.
