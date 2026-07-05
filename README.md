# Questions JSON Editor

A small Express web app that lets you view, add, edit, duplicate, and delete entries in `questions.json` through a browser UI.

## Features

- List/search/filter existing question records
- Add new entries
- Update existing entries
- Delete entries
- Dynamic answer fields
- Server-side validation
- Safe serialized writes to avoid concurrent overwrite issues
- Dark mode toggle

## Expected JSON format

The app expects a top-level JSON array with objects shaped like:

```json
{
  "id": "uuid-or-string",
  "category": "General",
  "question": "What is the capital of Spain?",
  "answers": ["Madrid", "Paris", "Barcelona", "Lisboa"]
}
```

If your existing file has no `id`, the server will generate stable `legacy-*` ids in memory and will write proper ids back on the first save.

## Setup

1. Copy your existing `questions.json` into the project root, beside `server.js`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000`

## Use a custom file path

You can point the app at a different server-side file:

```bash
DATA_FILE=/absolute/path/to/questions.json npm start
```

## Recommended deployment notes

- Put the app behind Basic Auth or another login layer before exposing it publicly.
- Run it with a process manager such as PM2 or systemd.
- Back up the JSON file regularly.
- Ensure the OS user running Node has write access to the target file.
