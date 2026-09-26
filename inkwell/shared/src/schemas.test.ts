import { describe, expect, it } from "vitest";
import { AnnotationResult, ModernizationResult, TranscriptionResult } from "./schemas";
import { narratedWords, prepareNarration } from "./narration";

describe("LLM output schemas", () => {
  it("accept a valid transcription", () => {
    expect(
      TranscriptionResult.safeParse({
        not_a_manuscript: false,
        lines: [{ n: 1, text: "Dr Sir" }],
        uncertain: [{ line: 1, reading: "Dr", alternatives: ["Dear"], reason: "faint" }],
        notes: "",
        script_description: "neat hand",
      }).success,
    ).toBe(true);
  });
  it("reject more than two alternatives", () => {
    expect(
      TranscriptionResult.safeParse({
        not_a_manuscript: false,
        lines: [],
        uncertain: [{ line: 1, reading: "a", alternatives: ["b", "c", "d"], reason: "" }],
        notes: "",
        script_description: "",
      }).success,
    ).toBe(false);
  });
  it("reject an unknown glossary category", () => {
    expect(
      ModernizationResult.safeParse({ modern_text: "", plain_english: "", summary: "", glossary: [{ original: "&", modern: "and", category: "emoji", explanation: "" }] }).success,
    ).toBe(false);
  });
  it("require exactly three discussion questions", () => {
    const meta = { value: null, confidence: "low", evidence: "" };
    const base = { letter_metadata: { author: meta, recipient: meta, date: meta, place: meta }, entities: [], context: "", why_it_matters: "" };
    expect(AnnotationResult.safeParse({ ...base, discussion_questions: ["a", "b", "c"] }).success).toBe(true);
    expect(AnnotationResult.safeParse({ ...base, discussion_questions: ["a", "b"] }).success).toBe(false);
  });
});

describe("prepareNarration", () => {
  it("drops [?] markers but maps every spoken character back to the display text", () => {
    const display = "serve as marines [?] leads them";
    const { text, displayIndex } = prepareNarration(display);
    expect(text).toBe("serve as marines leads them");
    for (const w of narratedWords(text)) {
      const shown = display.slice(displayIndex[w.start], displayIndex[w.end - 1]! + 1);
      expect(shown).toBe(text.slice(w.start, w.end));
    }
  });
});
