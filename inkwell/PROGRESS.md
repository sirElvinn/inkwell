# PROGRESS

Running log for Inkwell at &hacks XII (hacking 12:00 PM Sat Sep 26 → submissions 12:00 PM Sun Sep 27).

## Done

### P0: skeleton (started 2:25 PM, ~2.5 h behind the plan's clock)
- npm workspaces: `shared` (zod schemas + types), `server` (Express 5 + TS via tsx), `client` (Vite 8 + React 19 + Tailwind 4 + React Router 8).
- Env validated with zod at startup (`server/src/env.ts`); prints which vars are bad, never values.
- Prisma 7.10 schema (spec §8) + first migration; SQLite through the better-sqlite3 driver adapter.
- `GET /api/health` → `{ ok, db, gemini, elevenlabs }` (booleans only). Errors use `{ error: { code, message } }`.
- helmet (CSP allows Google Fonts), CORS (dev origin only), pino + pino-http logging with key redaction.
- Vite dev proxy `/api` + `/files` → Express. Production: Express serves `client/dist` with SPA fallback.
- `scripts/check-bundle.mjs` runs after the client build and fails it if a key or key-like string is in the bundle.
- Verified: typecheck (shared/server/client), `npm run build`, `npm test` (no tests yet), prod mode on :8082, dev mode via proxy.

### P1: upload → transcribe → Reader
- Shared zod schemas for all LLM outputs (Transcription, Modernization, Annotation), RunInfo, and API DTOs; Gemini gets `z.toJSONSchema(...)` of the same schema.
- `server/src/ai/gemini.ts`: `callGeminiJson` with per-call timeout, 2 retries (exponential backoff + jitter) on 429/500/503/timeout, one zod "repair" call, latency + token usage recorded.
- `pipeline/preprocess.ts` (sharp: EXIF rotate, ≤3000 px long side, JPEG q90, metadata stripped), `pipeline/transcribe.ts` (shared with the future eval CLI), `pipeline/run.ts` (p-limit 3, status per stage, partial saves, friendly errors, restart recovery).
- Routes: `POST /api/documents` (multer 15 MB, sharp format check, sha256 + PIPELINE_VERSION cache, 202), `GET /api/documents/:id`, `GET /api/documents?source=example`, `POST /api/documents/:id/retry`; `/files/uploads` static; rate limit 10/min/IP on uploads.
- Client: Home (camera button + dropzone + example gallery), Reader (1.5 s polling hook, progress steps with aria-live, zoomable image that collapses on phones, tabs with keyboard nav, As Written with line numbers and uncertain-word tooltips marked by underline + "?"), retry button, footer with model + time.
- **Verified end to end** on a real LOC scan (Washington to ?, New Windsor, Dec. 8, 1780, `mgw4/073/0300`): DONE in ~50 s, 27 lines, 1 uncertain reading; re-upload returned the cached doc (200, `cached: true`). Error paths checked: no file, non-image, unknown id, missing static file (404), bad JSON (400), not-a-manuscript image.

### P2: modernize ∥ annotate, all Reader tabs, examples
- `pipeline/modernize.ts` (thinking low) and `pipeline/annotate.ts` (thinking medium) share `textStage.ts`: GEMINI_MODEL_TEXT with the same fallback model. Prompts v1 from the spec, input = numbered lines + uncertain readings.
- `run.ts`: modernize and annotate run in parallel (`Promise.allSettled`), each saves the moment it finishes; a failed enrichment stage leaves the doc DONE with a per-stage message in `runInfo.errors`. Retry re-runs only missing stages.
- DTO now carries server-built Wikipedia search links per entity (Founders Online search URL not verifiable → not linked).
- Reader tabs: Modern English and Plain English (summary on top) with tappable people/places that open an EntityCard inline; People & Places (metadata with confidence + evidence, context, why it matters, entity cards grouped by type, discussion questions); Language Lens (glossary grouped by category with counts). Per-tab skeletons while running and friendly failure + retry.
- Examples: `server/src/seed/examples.json` + images; `npm run seed` runs the real pipeline and freezes results to `server/src/seed/results/*.json`; startup loads them with fixed ids `example-<slug>` (no API calls, race-safe).
- Verified: all three examples frozen and served; entity matching found all 12 entities in the Lafayette letter's modern text.

### P4: narration (done early; it only needed the ElevenLabs key)
- `ai/elevenlabs.ts` (with-timestamps endpoint, verified), sentence chunking ≤2,000 chars, per-word timings from per-character alignment with exact → normalized → proportional fallbacks.
- `pipeline/narrate.ts` + `POST /api/documents/:id/audio`: cache by sha256(text + voice + model), 5 generations/min/IP (cached replays don't count), in-flight dedupe, friendly quota/busy errors.
- Shared `prepareNarration()` removes `[?]` markers from what's spoken and maps every spoken character back to the displayed text; verified 77/77 and 202/202 words map to the right on-screen spans.
- AudioReader bar: Listen/Pause/Resume/Stop, speed 0.75–1.5×, live highlighting (rAF + timeupdate fallback), reduced-motion aware. Voice: ElevenLabs library "George - Warm, Captivating Storyteller", labeled "AI narrator voice".
- Examples ship with pre-made Modern English narration in `server/src/seed/audio/`.

### P3: evaluation (code done; data blocked)
- `shared/src/metrics.ts` (Levenshtein with rolling rows, alignment with backtrace, CER/WER, summaries) and `normalize.ts` (strict/loose); 25 vitest tests pass.
- `eval:fetch`, `eval:run`, `eval:baseline` CLIs; configs in `eval/configs/`; results to `eval/results/*.json` (+ EvalRun rows).
- `/api/eval/runs` serves the committed result files; Accuracy page (headline, chart, sortable table with famous filter, methodology, character diff) shows "not measured yet" until results exist.
- Also: About page, DEMO_MODE (+ "Offline demo" badge), prototype removed from the repo and disclosed in the root README; pushed to GitHub.

## Next
- Curate the eval set (10+ LOC scan ↔ Founders Online pairs) and run `flash-lite-high` (+ `flash-high` when the daily quota resets) and `tesseract`.
- Re-seed examples with Gemini Flash once its daily quota resets (current frozen outputs come from the fallback model).
- Deploy on DigitalOcean; README/DEVPOST/VIDEO_SCRIPT (P6).
- Deploy: GitHub repo + DigitalOcean App Platform (`.do/app.yaml` is ready).

## Blockers
- **Deploy:** needs a GitHub repo and a DigitalOcean account (no `gh`/`doctl` on this machine).
- **Git identity:** `user.name` not set; needed before the first commit.
- **ElevenLabs quota:** free tier, 10,000 characters/month. Ask the MLH coach for credits.
- **Eval manifest:** not provided yet (10 pages minimum).
- **Gemini Flash free tier = 20 requests/day**, and it's used up (429 `generate_content_free_tier_requests, limit: 20`). Everything since has run on the fallback model. Billing (or MLH credits) needed for Flash-based eval configs and a reliable demo.
- **Eval data:** Founders Online's `/API/docdata` returns 403 even from a browser; document pages and the metadata index (184,138 docs) are readable in a browser. The Library of Congress started returning 429 after bulk item lookups (from scripts and then the browser), so candidate pairing is paused.
- **Gemini free-tier rate limits (earlier):** during seeding `gemini-3.8-flash` returned 429s; the fallback model produced most example results (recorded per stage in runInfo).
- **Gemini free tier:** `gemini-3.1-pro-preview` has a free-tier quota of 0 (429), so the Pro fallback and the `pro-high` eval config can't run without billing. `gemini-3.8-flash` returned 503 "high demand" repeatedly this afternoon.

## Decisions
- **Narration response shape:** `{ audioUrls[], words[], durationSec, voiceLabel }` instead of a single `audioUrl`, because long letters are split into chunks played as a playlist; word times are relative to their chunk.
- **Eval results are served from the committed JSON files**, not the DB (the DB on App Platform is ephemeral); `eval:run` still inserts EvalRun rows as the spec asks.
- **Eval configs:** added `flash-lite-high` (what a free-tier key can run); dropped `flash-ultra` (no ULTRA_HIGH value in `@google/genai` 2.24.0).
- **Founders Online API is closed to scripts (403)**, so `eval:fetch` falls back to "paste the text from the document page" instructions.
- **Examples chosen by the agent during the event** (no user-provided images yet): three lesser-known one-page LOC letters, including the Williamsburg letter (W&M tie-in). Frozen outputs were reviewed by eye: the Lafayette letter's date is misread as "28th" (page says 8th); the others read well. Replace or add examples by editing `examples.json` and re-running `npm run seed`.
- Examples have fixed ids (`example-<slug>`) so demo links are stable and concurrent startups can't duplicate them (this happened once with random ids).
- **Gemini SDK (`@google/genai` 2.24.0) vs spec §10.1:** structured output uses `responseMimeType` + `responseJsonSchema` (the spec's `responseFormat` is the Interactions API); thinking levels are `ThinkingLevel.*` enum values; timeout is `httpOptions.timeout`; `MediaResolution` has no ULTRA_HIGH value in this SDK, so the `flash-ultra` eval config needs a raw request or is dropped.
- **Transcription fallback model is `GEMINI_MODEL_FALLBACK` (default `gemini-3.5-flash-lite`)**, not Pro, because Pro has no free-tier quota. It already rescued one real run when Flash was overloaded.
- **Raised letters:** with prompt v1 the model writes them with a dot (`D.r Sir`, `Gen.l`). Loose normalization strips punctuation, so it doesn't affect loose CER; revisit after the first eval.
- Added `POST /api/documents/:id/retry` (spec mentions a retry option but not the route).
- `not_a_manuscript` (or zero lines) ends the pipeline as ERROR with a friendly message.
- **SQLite instead of hosted Postgres** (spec §5 fallback): no Postgres URL was available at start. DigitalOcean's disk is ephemeral, which is fine because examples are re-seeded from committed frozen results at startup. Switching = change provider + adapter + new migration.
- **Node 24 LTS** (installed via Homebrew as `node@24`), `engines.node: 24.x`.
- **Prisma pinned to 7.10.0**: npm's `latest` tag for `prisma` points at 8.0.0-rc.17 (a release candidate); 7.10.0 is the newest stable and matches `@prisma/client`.
- **Prisma 7 differences from the spec's era:** config lives in `server/prisma.config.ts` (loads the root `.env`), generator is `prisma-client` with output `server/src/generated/prisma` (gitignored, regenerated on build), and `migrate dev` no longer runs `generate`.
- **npm 11 `allowScripts`:** install scripts approved only for better-sqlite3, esbuild, prisma, @prisma/engines; fsevents denied (optional macOS watcher).
- **Server runs TypeScript via `tsx` in production too**; `build` runs `tsc --noEmit` for type safety. Avoids a separate compile step for the shared workspace.
- **TypeScript 7.0** (current stable, native compiler) across workspaces.
- `npm audit`: 4 high advisories in Prisma's CLI dependencies (mysql2, deepmerge-ts), not in our runtime path. Revisit if Prisma ships a patch.
- Python prototype from before the event (`../` outside this repo) is **not** part of Inkwell and is not used.
