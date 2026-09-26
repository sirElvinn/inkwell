// Fails the build if anything that looks like an API key, or the actual key values from .env,
// ended up in the client bundle. Run after `vite build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: new URL("../.env", import.meta.url).pathname, quiet: true });
const dist = new URL("../client/dist", import.meta.url).pathname;

const secrets = ["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "DATABASE_URL"]
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 12);
const patterns = [/AIza[0-9A-Za-z_-]{30,}/, /\bsk_[0-9a-f]{32,}\b/, /xi-api-key/i, /postgres(ql)?:\/\/[^"'\s]+:[^"'\s]+@/];

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const problems = [];
for (const file of files(dist)) {
  const text = readFileSync(file, "utf8");
  if (secrets.some((s) => text.includes(s))) problems.push(`${file}: contains a value from .env`);
  for (const p of patterns) if (p.test(text)) problems.push(`${file}: matches ${p}`);
}
if (problems.length) {
  console.error("Secret check FAILED:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Secret check passed (${files(dist).length} files scanned).`);
