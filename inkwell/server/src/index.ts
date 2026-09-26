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
import { documentsRouter } from "./routes/documents";
import { healthRouter } from "./routes/health";
import { UPLOAD_DIR } from "./lib/storage";

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
app.use("/api/documents", documentsRouter);
app.use("/api", notFound);

// Uploaded images (originals + derivatives). Filenames are content hashes, so they can be cached.
app.use("/files/uploads", express.static(UPLOAD_DIR, { index: false, maxAge: "7d", immutable: true, fallthrough: false }));

// Production: serve the built React app, with client-side routing fallback.
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: isProd ? "1h" : 0 }));
  app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: clientDist }));
}

app.use(notFound);
app.use(errorHandler);

await recoverInterruptedDocuments();
app.listen(env.PORT, () => logger.info(`Inkwell server on http://localhost:${env.PORT}`));
