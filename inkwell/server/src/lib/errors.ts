import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";

/** An error that is safe to show the user: it carries an HTTP status and a stable code. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, "not_found", "Not found."));

/** Converts every error to { error: { code, message } }. Unknown errors never leak details to the client. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: "bad_request", message: "The request was not in the expected format." } });
    return;
  }
  // express.static / body-parser raise errors carrying a 4xx status (e.g. a missing file under /files).
  const status = (err as { status?: number }).status;
  if (!(err instanceof HttpError) && status && status >= 400 && status < 500) {
    res.status(status).json({ error: { code: status === 404 ? "not_found" : "bad_request", message: status === 404 ? "Not found." : "Bad request." } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  logger.error({ err, path: req.path }, "unhandled error");
  res.status(500).json({ error: { code: "internal", message: "Something went wrong. Please try again." } });
};
