# Inkwell

Read the Founders' handwriting: photograph an 18th-century letter and get a faithful transcription, modern and plain English versions, the people and places explained, and narration with word-by-word highlighting.

> Work in progress at &hacks XII (William & Mary). Full README coming in P6.

## Run locally

Requires Node 24.

```bash
npm install
cp .env.example .env              # add GEMINI_API_KEY and ELEVENLABS_API_KEY
npm run db:migrate -w server      # creates the SQLite database
npm run dev                       # client on http://localhost:5173, API on :8080
```

## Built during &hacks XII

All code in this repository was written during the event (from 12:00 PM Saturday, Sep 26, 2026). Pre-existing assets: none so far.
