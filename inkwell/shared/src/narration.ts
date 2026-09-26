// Narration text shared by server and client, so both agree on exactly which words are spoken.
//
// The Modern English text marks uncertain words with "[?]" (e.g. "marines [?]"). Those markers
// shouldn't be read aloud, so we remove them to get the narrated text, and remember where each
// narrated character came from in the displayed text. The browser uses that map to highlight
// the right word on screen while the audio plays.

export type NarrationVariant = "modern" | "plain";

export interface PreparedNarration {
  /** The exact text sent to ElevenLabs. */
  text: string;
  /** displayIndex[i] = position in the displayed text of narrated character i. */
  displayIndex: number[];
}

const MARKER = /\s*\[\?\]/g;

export function prepareNarration(display: string): PreparedNarration {
  let text = "";
  const displayIndex: number[] = [];
  let pos = 0;
  const copyUpTo = (end: number) => {
    for (; pos < end; pos++) {
      text += display[pos];
      displayIndex.push(pos);
    }
  };
  for (const m of display.matchAll(MARKER)) {
    copyUpTo(m.index);
    pos = m.index + m[0].length; // skip the marker (and the space before it)
  }
  copyUpTo(display.length);
  return { text, displayIndex };
}

/** Word spans in the narrated text. Word k here is word k in the audio's timing data. */
export function narratedWords(text: string): { start: number; end: number }[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}
