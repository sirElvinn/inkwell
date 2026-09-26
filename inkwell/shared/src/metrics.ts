// Edit distance, alignment, and error rates (spec §12.4). Written by hand so we can explain it.
//
// Levenshtein distance = the fewest single-token edits (insert, delete, substitute) that turn
// sequence a into sequence b. Classic dynamic programming:
//
//   D[i][j] = distance between the first i tokens of a and the first j tokens of b
//   D[i][0] = i          (delete all i tokens)
//   D[0][j] = j          (insert all j tokens)
//   D[i][j] = min( D[i-1][j] + 1,                       delete a[i-1]
//                  D[i][j-1] + 1,                       insert b[j-1]
//                  D[i-1][j-1] + (a[i-1] == b[j-1] ? 0 : 1) )   keep or substitute
//
// Row i only needs row i-1, so we keep two rows: O(|a|·|b|) time, O(min(|a|,|b|)) memory.
// It's generic over tokens: arrays of characters give character distance (for CER),
// arrays of words give word distance (for WER).

export function levenshtein<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = Object.is): number {
  // Make b the shorter sequence so the rows are as small as possible.
  if (b.length > a.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j); // row 0: D[0][j] = j
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i; // D[i][0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = eq(a[i - 1]!, b[j - 1]!) ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

export type EditOp<T> =
  | { op: "equal"; a: T; b: T }
  | { op: "substitute"; a: T; b: T }
  | { op: "delete"; a: T }
  | { op: "insert"; b: T };

/**
 * Full-table Levenshtein with backtrace: returns the list of edits that turns a into b.
 * Uses O(|a|·|b|) memory, so use it on words or short strings (e.g. comparing two transcriptions).
 */
export function levenshteinAlign<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = Object.is): EditOp<T>[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const D = new Uint32Array(rows * cols);
  const at = (i: number, j: number) => i * cols + j;
  for (let i = 0; i < rows; i++) D[at(i, 0)] = i;
  for (let j = 0; j < cols; j++) D[at(0, j)] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = eq(a[i - 1]!, b[j - 1]!) ? 0 : 1;
      D[at(i, j)] = Math.min(D[at(i - 1, j)]! + 1, D[at(i, j - 1)]! + 1, D[at(i - 1, j - 1)]! + cost);
    }
  }
  // Walk back from the bottom-right corner, choosing a step that explains each cell's value.
  const ops: EditOp<T>[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && eq(a[i - 1]!, b[j - 1]!) && D[at(i, j)] === D[at(i - 1, j - 1)]) {
      ops.push({ op: "equal", a: a[i - 1]!, b: b[j - 1]! });
      i--; j--;
    } else if (i > 0 && j > 0 && D[at(i, j)] === D[at(i - 1, j - 1)]! + 1) {
      ops.push({ op: "substitute", a: a[i - 1]!, b: b[j - 1]! });
      i--; j--;
    } else if (i > 0 && D[at(i, j)] === D[at(i - 1, j)]! + 1) {
      ops.push({ op: "delete", a: a[i - 1]! });
      i--;
    } else {
      ops.push({ op: "insert", b: b[j - 1]! });
      j--;
    }
  }
  return ops.reverse();
}

/** Characters as an array of Unicode code points (so "ſ" or an emoji counts as one). */
export const chars = (s: string) => Array.from(s);
export const words = (s: string) => s.split(/\s+/).filter(Boolean);

export interface ErrorRates {
  cer: number;
  wer: number;
  charEdits: number;
  refChars: number;
  wordEdits: number;
  refWords: number;
}

/** CER = char edits / reference chars; WER = word edits / reference words. Inputs should already be normalized. */
export function errorRates(prediction: string, reference: string): ErrorRates {
  const refChars = chars(reference).length;
  const refWords = words(reference).length;
  const charEdits = levenshtein(chars(prediction), chars(reference));
  const wordEdits = levenshtein(words(prediction), words(reference));
  return {
    cer: refChars ? charEdits / refChars : prediction ? 1 : 0,
    wer: refWords ? wordEdits / refWords : prediction ? 1 : 0,
    charEdits,
    refChars,
    wordEdits,
    refWords,
  };
}

/** Character accuracy as the spec defines it: max(0, 1 − CER). */
export const charAccuracy = (cer: number) => Math.max(0, 1 - cer);

export function summarize(values: number[]): { mean: number; median: number; min: number; max: number } {
  if (!values.length) return { mean: 0, median: 0, min: 0, max: 0 };
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return {
    mean: values.reduce((s, v) => s + v, 0) / values.length,
    median: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}
