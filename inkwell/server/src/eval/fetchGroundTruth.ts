// npm run eval:fetch [-- --force]
// Fetches each manifest entry's Founders Online text into eval/ground-truth/{id}.json and {id}.txt.
//
// NOTE: Founders Online's /API/docdata endpoint currently answers 403 to scripts (and its site sits
// behind a bot challenge). When that happens this script says so and leaves the entry for manual
// collection: open the document page in a browser and paste the letter text into {id}.txt.
// Existing files are skipped unless --force, and a file for an entry marked `trimmed` is never overwritten.
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { groundTruthPath, readManifest } from "./common";

const force = process.argv.includes("--force");
let fetched = 0;
let manual = 0;
for (const entry of await readManifest()) {
  const txt = groundTruthPath(entry.id, "txt");
  if (existsSync(txt) && (!force || entry.trimmed)) {
    console.log(`skip ${entry.id} (${entry.trimmed ? "trimmed by hand" : "exists"})`);
    continue;
  }
  const url = `https://founders.archives.gov/API/docdata/${entry.foundersId}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Inkwell hackathon eval (student project)" } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("json")) throw new Error(`HTTP ${res.status}`);
    const doc = (await res.json()) as { content?: string };
    if (!doc.content) throw new Error("no content field");
    await writeFile(groundTruthPath(entry.id, "json"), JSON.stringify(doc, null, 2) + "\n");
    await writeFile(txt, doc.content.trim() + "\n");
    fetched++;
    console.log(`fetched ${entry.id}`);
  } catch (err) {
    manual++;
    console.warn(`MANUAL ${entry.id}: ${(err as Error).message}. Open https://founders.archives.gov/documents/${entry.foundersId} and paste the letter text into eval/ground-truth/${entry.id}.txt`);
  }
  await new Promise((r) => setTimeout(r, 500)); // ≤ 2 requests/second
}
console.log(`\nfetched ${fetched}, needs manual collection: ${manual}`);
