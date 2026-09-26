// File locations. UPLOAD_DIR/AUDIO_DIR are resolved relative to the server/ folder so the
// app behaves the same whether it's started from the repo root or from server/.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env";

const SERVER_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const UPLOAD_DIR = path.resolve(SERVER_ROOT, env.UPLOAD_DIR);
export const AUDIO_DIR = path.resolve(SERVER_ROOT, env.AUDIO_DIR);

/** Save a buffer under UPLOAD_DIR and return its path relative to UPLOAD_DIR (what we store in the DB). */
export async function saveUpload(fileName: string, data: Buffer): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, fileName), data);
  return fileName;
}

export const uploadPath = (relative: string) => path.join(UPLOAD_DIR, relative);
export const uploadUrl = (relative: string) => `/files/uploads/${relative}`;
