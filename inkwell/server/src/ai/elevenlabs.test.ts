import { describe, expect, it } from "vitest";
import { chunkText, proportionalTimings, wordTimingsFromAlignment } from "./elevenlabs";

const alignFor = (text: string) => ({
  characters: Array.from(text),
  // character i is spoken from 0.1·i to 0.1·i + 0.1 seconds
  character_start_times_seconds: Array.from(text, (_, i) => i * 0.1),
  character_end_times_seconds: Array.from(text, (_, i) => i * 0.1 + 0.1),
});

describe("wordTimingsFromAlignment", () => {
  it("uses the first character's start and the last character's end for each word", () => {
    const text = "Dear  Sir,";
    const words = wordTimingsFromAlignment(text, alignFor(text));
    expect(words.map((w) => w.word)).toEqual(["Dear", "Sir,"]);
    expect(words[0]).toMatchObject({ start: 0, charStart: 0, charEnd: 4 });
    expect(words[0]!.end).toBeCloseTo(0.4);
    expect(words[1]).toMatchObject({ charStart: 6, charEnd: 10 });
    expect(words[1]!.start).toBeCloseTo(0.6);
    expect(words[1]!.end).toBeCloseTo(1.0);
  });
});

describe("proportionalTimings", () => {
  it("spreads the duration over the words in order, ending at the duration", () => {
    const words = proportionalTimings("a bb ccc", 9);
    expect(words.map((w) => w.word)).toEqual(["a", "bb", "ccc"]);
    expect(words[0]!.start).toBe(0);
    expect(words[2]!.end).toBeCloseTo(9);
    expect(words[1]!.start).toBeCloseTo(words[0]!.end);
  });
});

describe("chunkText", () => {
  it("keeps short text in one chunk", () => expect(chunkText("One. Two.")).toEqual(["One. Two."]));
  it("splits on sentence boundaries under the limit", () => {
    const chunks = chunkText("First sentence here. Second one. Third sentence is longer.", 25);
    expect(chunks.every((c) => c.length <= 25)).toBe(true);
    expect(chunks.join(" ")).toBe("First sentence here. Second one. Third sentence is longer.");
  });
});
