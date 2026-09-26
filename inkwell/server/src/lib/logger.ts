import pino from "pino";
import { isProd } from "../env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Never log credentials, even by accident.
  redact: ["req.headers.authorization", "req.headers.cookie", "*.apiKey", "*.GEMINI_API_KEY", "*.ELEVENLABS_API_KEY"],
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }),
});
