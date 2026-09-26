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

## Next
- P2: modernize ∥ annotate, remaining Reader tabs, entity cards, Language Lens, seed script with 3 examples.
- Deploy: GitHub repo + DigitalOcean App Platform (`.do/app.yaml` is ready).

## Blockers
- **Deploy:** needs a GitHub repo and a DigitalOcean account (no `gh`/`doctl` on this machine).
- **Git identity:** `user.name` not set; needed before the first commit.
- **ElevenLabs quota:** free tier, 10,000 characters/month. Ask the MLH coach for credits.
- **Example images + eval manifest:** not provided yet.
- **Gemini free tier:** `gemini-3.1-pro-preview` has a free-tier quota of 0 (429), so the Pro fallback and the `pro-high` eval config can't run without billing. `gemini-3.8-flash` returned 503 "high demand" repeatedly this afternoon.

## Decisions
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
