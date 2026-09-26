import cors from "cors";
import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http";
import { env, isProd } from "./env";
import { errorHandler, notFound } from "./lib/errors";
import { logger } from "./lib/logger";
import { recoverInterruptedDocuments } from "./pipeline/run";
import { loadExamples } from "./seed/examples";
import { audioRouter } from "./routes/audio";
import { documentsRouter } from "./routes/documents";
import { evalRouter } from "./routes/eval";
import { healthRouter } from "./routes/health";
import { AUDIO_DIR, UPLOAD_DIR } from "./lib/storage";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind DigitalOcean's load balancer in prod

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "style-src": ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "blob:"],
      "media-src": ["'self'", "blob:"],
    },
  },
}));
// In dev the Vite proxy makes requests same-origin; in prod the client is served by this server.
app.use(cors({ origin: isProd ? false : "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

app.use("/api/health", healthRouter);
app.use("/api/documents/:id/audio", audioRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/eval", evalRouter);
app.use("/api", notFound);

// Uploaded images (originals + derivatives). Filenames are content hashes, so they can be cached.
app.use("/files/uploads", express.static(UPLOAD_DIR, { index: false, maxAge: "7d", immutable: true, fallthrough: false }));
// Narration audio. Filenames include a hash of the text + voice + model, so they never change.
app.use("/files/audio", express.static(AUDIO_DIR, { index: false, maxAge: "7d", immutable: true, fallthrough: false }));

// Production: serve the built React app, with client-side routing fallback.
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: isProd ? "1h" : 0 }));
  app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: clientDist }));
}

app.use(notFound);
app.use(errorHandler);

await recoverInterruptedDocuments();
await loadExamples().catch((err) => logger.error({ err }, "failed to load examples"));
app.listen(env.PORT, () => logger.info(`Inkwell server on http://localhost:${env.PORT}`));
