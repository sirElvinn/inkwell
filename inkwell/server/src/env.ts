// Environment variables, validated once at startup. Keys stay server-side and are never logged.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const optionalKey = z.string().trim().optional().transform((v) => (v ? v : undefined));

const Env = z.object({
  PORT: z.coerce.number().int().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  AUDIO_DIR: z.string().default("./data/audio"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(15),
  PIPELINE_VERSION: z.string().default("v1"),
  DEMO_MODE: z.stringbool().default(false),

  GEMINI_API_KEY: optionalKey,
  GEMINI_MODEL_TRANSCRIBE: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_TEXT: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_PRO: z.string().default("gemini-3.1-pro-preview"),
  GEMINI_MODEL_FALLBACK: z.string().default("gemini-3.5-flash-lite"),

  ELEVENLABS_API_KEY: optionalKey,
  ELEVENLABS_VOICE_ID: optionalKey,
  ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // Print which variables are wrong, never their values.
  console.error("Invalid environment:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
