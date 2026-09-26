import { describe, expect, it } from "vitest";
import { chars, errorRates, levenshtein, levenshteinAlign, summarize, words } from "./metrics";
import { normalizeLoose, normalizeStrict } from "./normalize";

describe("levenshtein", () => {
  it("kitten → sitting = 3", () => expect(levenshtein(chars("kitten"), chars("sitting"))).toBe(3));
  it("identical strings = 0", () => expect(levenshtein(chars("Excellency"), chars("Excellency"))).toBe(0));
  it("empty cases", () => {
    expect(levenshtein(chars(""), chars(""))).toBe(0);
    expect(levenshtein(chars(""), chars("abc"))).toBe(3);
    expect(levenshtein(chars("abc"), chars(""))).toBe(3);
  });
  it("is symmetric", () => expect(levenshtein(chars("flaw"), chars("lawn"))).toBe(levenshtein(chars("lawn"), chars("flaw"))));
  it("counts a Unicode character (long s) as one", () => expect(levenshtein(chars("ſhall"), chars("shall"))).toBe(1));
  it("works on words", () => expect(levenshtein(words("I have the honor"), words("I had the honour"))).toBe(2));
});

describe("levenshteinAlign", () => {
  it("returns edits whose count matches the distance", () => {
    const ops = levenshteinAlign(words("the quick brown fox"), words("the brown fax jumps"));
    expect(ops.filter((o) => o.op !== "equal").length).toBe(levenshtein(words("the quick brown fox"), words("the brown fax jumps")));
  });
  it("marks a substitution", () => {
    expect(levenshteinAlign(words("Genl Washington"), words("General Washington"))).toEqual([
      { op: "substitute", a: "Genl", b: "General" },
      { op: "equal", a: "Washington", b: "Washington" },
    ]);
  });
});

describe("normalizeStrict", () => {
  it("collapses whitespace and line breaks, keeps case and punctuation", () =>
    expect(normalizeStrict("  Dear  Sir,\r\n\tI am ")).toBe("Dear Sir, I am"));
});

describe("normalizeLoose", () => {
  it("maps long s to s", () => expect(normalizeLoose("Congreſs ſhall")).toBe("congress shall"));
  it("removes bracketed editorial text", () => expect(normalizeLoose("the [illegible] man [i.e., Genl]")).toBe("the man"));
  it("joins words hyphenated across a line break", () => expect(normalizeLoose("introdu-\ncing him")).toBe("introducing him"));
  it("straightens quotes, drops punctuation but keeps &", () => expect(normalizeLoose("“Yr. Most obedt.” & c—")).toBe("yr most obedt & c"));
});

describe("errorRates", () => {
  it("computes CER and WER against the reference length", () => {
    const r = errorRates("abcd", "abce");
    expect(r.cer).toBeCloseTo(0.25);
    expect(r.wer).toBe(1);
  });
  it("is zero for a perfect match", () => expect(errorRates("I am Sir", "I am Sir")).toMatchObject({ cer: 0, wer: 0 }));
});

describe("summarize", () => {
  it("mean, median, min, max", () => expect(summarize([0.1, 0.3, 0.2, 0.4])).toEqual({ mean: 0.25, median: 0.25, min: 0.1, max: 0.4 }));
});
