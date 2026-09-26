// Text normalization for evaluation (spec §12.4). Both the model's transcription and the
// Founders Online reference go through the SAME function before we compare them.

/** Strict: only whitespace and Unicode form are normalized; spelling, case and punctuation all count. */
export function normalizeStrict(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loose: ignores differences that are about editorial conventions, not reading ability.
 *   - long s (ſ) → s
 *   - curly quotes/apostrophes → straight; all dash variants → "-"
 *   - [bracketed editorial text] removed from both sides, e.g. "[illegible]", "[i.e., …]"
 *   - words split across a line end with a hyphen are joined ("introdu-\ncing" → "introducing")
 *   - lowercase, punctuation removed except "&", whitespace collapsed
 */
export function normalizeLoose(s: string): string {
  return normalizeStrict(
    s
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/ſ/g, "s")
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐-―−]/g, "-")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{L})/gu, "$1$2")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}&\s]/gu, " "),
  );
}
