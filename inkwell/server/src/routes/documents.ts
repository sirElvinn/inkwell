import { CreateDocumentResponse, DocumentSource, DocumentSummary } from "@inkwell/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { env } from "../env";
import { prisma } from "../lib/db";
import { toDocumentDTO } from "../lib/dto";
import { HttpError } from "../lib/errors";
import { sha256 } from "../lib/hash";
import { saveUpload, uploadUrl } from "../lib/storage";
import { readImageFormat } from "../pipeline/preprocess";
import { canRetry, startPipeline } from "../pipeline/run";

export const documentsRouter = Router();

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const EXTENSION: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp" };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many uploads. Please wait a minute and try again." } },
});

/** Wrap multer so its errors (e.g. file too large) become our friendly error format. */
function receiveImage(): import("express").RequestHandler {
  const single = upload.single("image");
  return (req, res, next) =>
    single(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return next(new HttpError(413, "file_too_large", `That image is over ${env.MAX_UPLOAD_MB} MB. Try a smaller photo.`));
      }
      if (err) return next(new HttpError(400, "bad_upload", "We couldn't read that upload. Please try again."));
      next();
    });
}

// POST /api/documents: validate, hash, return the cached result or start the pipeline.
documentsRouter.post("/", uploadLimiter, receiveImage(), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "no_image", "Please choose an image to upload.");

  // Trust sharp, not the browser's mime type: this proves the file is a real image.
  const format = await readImageFormat(file.buffer);
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    const heicHint = format === "heif" ? " iPhone HEIC photos aren't supported; please upload a JPEG or PNG." : "";
    throw new HttpError(400, "unsupported_image", `Please upload a JPEG, PNG, or WebP image.${heicHint}`);
  }

  const imageSha256 = sha256(file.buffer);
  const pipelineVersion = env.PIPELINE_VERSION;

  // Content-hash cache: the same image + pipeline version is only processed once.
  const existing = await prisma.document.findFirst({
    where: { imageSha256, pipelineVersion, status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    res.status(200).json(CreateDocumentResponse.parse({ id: existing.id, status: "DONE", cached: true }));
    return;
  }

  const originalPath = await saveUpload(`${imageSha256}.${EXTENSION[format]}`, file.buffer);
  const doc = await prisma.document.create({
    data: { source: "upload", imageSha256, originalPath, status: "QUEUED", pipelineVersion },
  });
  startPipeline(doc.id);
  res.status(202).json(CreateDocumentResponse.parse({ id: doc.id, status: doc.status }));
});

const IdParam = z.object({ id: z.string().min(1).max(64) });

// GET /api/documents/:id: full DTO with whatever stages are done.
documentsRouter.get("/:id", async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new HttpError(404, "not_found", "We couldn't find that letter.");
  res.json(toDocumentDTO(doc));
});

// POST /api/documents/:id/retry: re-run a failed document, or only its missing stages.
documentsRouter.post("/:id/retry", uploadLimiter, async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new HttpError(404, "not_found", "We couldn't find that letter.");
  if (!canRetry(doc)) throw new HttpError(409, "not_retryable", "This letter doesn't need a retry.");
  await prisma.document.update({ where: { id }, data: { status: "QUEUED", errorMessage: null } });
  startPipeline(id);
  res.status(202).json(CreateDocumentResponse.parse({ id, status: "QUEUED" }));
});

// GET /api/documents?source=example: the example gallery.
documentsRouter.get("/", async (req, res) => {
  const { source } = z.object({ source: DocumentSource.default("example") }).parse(req.query);
  if (source !== "example") throw new HttpError(400, "bad_query", "Only source=example can be listed.");
  const docs = await prisma.document.findMany({ where: { source, status: "DONE" }, orderBy: { createdAt: "asc" } });
  res.json(docs.map((d) => DocumentSummary.parse({ id: d.id, title: d.title, status: d.status, imageUrl: uploadUrl(d.derivedPath ?? d.originalPath) })));
});
