# Founders' Ink

Snap a Revolutionary-era letter and get a diplomatic transcription, a modern version, context cards for the people and places, and ElevenLabs narration with synced highlighting.

## Run it

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # add GEMINI_API_KEY and ELEVENLABS_API_KEY
.venv/bin/uvicorn app.main:app --reload
```

Open http://localhost:8000. To try it on a phone on the same Wi-Fi, run with `--host 0.0.0.0` and open `http://<your-mac's-IP>:8000` (camera capture needs HTTPS on some phones; deploy for the demo).

**Demo mode:** with no keys, the app runs on the bundled sample letter and uses the browser's voice. The status pill in the top right shows the current mode.

## Layout

| Path | What |
| --- | --- |
| `app/main.py` | FastAPI routes: `/api/transcribe`, `/api/modernize`, `/api/context`, `/api/narrate`, samples, audio |
| `app/pipeline.py` | Gemini and ElevenLabs calls, JSON schemas, disk cache (`.cache/`), demo fallbacks |
| `app/static/` | Frontend (plain HTML/CSS/JS, no build step) |
| `app/samples/` | Bundled demo letters: `page.jpg` + each stage's JSON |
| `prompts/` | System prompts for each Gemini stage |
| `eval/` | `transcribe.py` (run a variant over the eval pages) and `score.py` (CER/WER) |

## Adding a real demo letter

Run a letter through the app once with keys set, then copy its cached stage outputs into `app/samples/<id>/` (`transcribe.json`, `modernize.json`, `context.json`, `page.jpg`, `meta.json`). It then loads instantly with no API calls.

## Notes

- The bundled sample (`demo-valley-forge`) is an illustrative letter written for this app, not a historical document.
- Founders Online texts are for scoring only; `.gitignore` keeps `eval/data/*.ref.txt` out of the repo.
- Narration uses a library voice as a narrator; it does not imitate any historical person.
