// Modern / Plain English text with:
//   - the letter's people and places as tappable names (tap → EntityCard below the paragraph)
//   - every narrated word wrapped in <span data-w="k">, so the AudioReader can highlight word k
//     while it is spoken. Word k is the k-th word of prepareNarration(text).text, the exact text
//     the server sent to ElevenLabs, mapped back to where it appears on screen.
import { narratedWords, prepareNarration, type AnnotationResult, type NarrationVariant } from "@inkwell/shared";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EntityCard } from "./EntityCard";

type Entity = AnnotationResult["entities"][number];

/**
 * Words to look for in the modern text for each entity. The modern text spells names differently
 * from the manuscript ("Marquis de la Fayette" → "Marquis de Lafayette"), so besides the surface form
 * and canonical name we also try the canonical name's last word (e.g. "Lafayette", "Rochambeau").
 */
function searchTerms(e: Entity): string[] {
  const terms = new Set<string>();
  const clean = (s: string) => s.replace(/\.(?=\w)/g, "").trim();
  terms.add(clean(e.surface));
  if (e.canonical_name) {
    terms.add(e.canonical_name);
    const afterComma = e.canonical_name.split(",").pop()!.trim();
    terms.add(afterComma);
    const last = afterComma.split(/\s+/).pop() ?? "";
    if (last.length >= 5 && /^[A-Z]/.test(last)) terms.add(last);
  }
  return [...terms].filter((t) => t.length >= 3);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Match { start: number; end: number; entity: number }

/** Find non-overlapping entity mentions, preferring longer matches. */
export function findMentions(text: string, entities: Entity[]): Match[] {
  const candidates: Match[] = [];
  entities.forEach((e, i) => {
    for (const term of searchTerms(e)) {
      const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "g");
      for (let m = re.exec(text); m; m = re.exec(text)) candidates.push({ start: m.index, end: m.index + term.length, entity: i });
    }
  });
  candidates.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const chosen: Match[] = [];
  let lastEnd = -1;
  for (const c of candidates) {
    if (c.start >= lastEnd) {
      chosen.push(c);
      lastEnd = c.end;
    }
  }
  return chosen;
}

/** Narrated word k → its [start, end) range in the displayed text. */
function displayWordRanges(text: string): { start: number; end: number }[] {
  const { text: narrated, displayIndex } = prepareNarration(text);
  return narratedWords(narrated).map((w) => ({ start: displayIndex[w.start]!, end: displayIndex[w.end - 1]! + 1 }));
}

/** Render text[a, b) with each narrated word (or the part of it inside this range) wrapped in a data-w span. */
function renderRange(text: string, a: number, b: number, words: { start: number; end: number }[], keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = a;
  for (let k = 0; k < words.length; k++) {
    const w = words[k]!;
    if (w.end <= a) continue;
    if (w.start >= b) break;
    const s = Math.max(w.start, a);
    const e = Math.min(w.end, b);
    if (s > pos) out.push(<Fragment key={`${keyPrefix}t${pos}`}>{text.slice(pos, s)}</Fragment>);
    out.push(
      <span key={`${keyPrefix}w${s}`} data-w={k} className="rounded-sm">
        {text.slice(s, e)}
      </span>,
    );
    pos = e;
  }
  if (pos < b) out.push(<Fragment key={`${keyPrefix}t${pos}`}>{text.slice(pos, b)}</Fragment>);
  return out;
}

export function ReadableText({
  text,
  entities,
  links,
  variant,
}: {
  text: string;
  entities: Entity[];
  links: { wikipedia: string | null }[];
  variant: NarrationVariant;
}) {
  const [open, setOpen] = useState<{ para: number; entity: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Paragraphs with their absolute offsets, so word ranges (computed on the whole text) line up.
  const paragraphs = useMemo(() => [...text.matchAll(/[^\n]+/g)].filter((m) => m[0].trim()).map((m) => ({ start: m.index, end: m.index + m[0].length })), [text]);
  const words = useMemo(() => displayWordRanges(text), [text]);

  // Long paragraphs can push the card off-screen, so bring it into view when it opens.
  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [open]);

  return (
    <div className="space-y-4 font-serif text-lg leading-relaxed" data-narration={variant}>
      {paragraphs.map((para, pi) => {
        const paraText = text.slice(para.start, para.end);
        const parts: ReactNode[] = [];
        let pos = para.start;
        for (const m of findMentions(paraText, entities)) {
          const ms = para.start + m.start;
          const me = para.start + m.end;
          parts.push(...renderRange(text, pos, ms, words, `p${pi}-`));
          const isOpen = open?.para === pi && open.entity === m.entity;
          parts.push(
            <button
              key={`e${ms}`}
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : { para: pi, entity: m.entity })}
              className="rounded-sm border-b-2 border-sepia/60 font-medium text-ink hover:bg-parchment-deep"
            >
              {renderRange(text, ms, me, words, `e${ms}-`)}
            </button>,
          );
          pos = me;
        }
        parts.push(...renderRange(text, pos, para.end, words, `p${pi}-end-`));
        const openEntity = open?.para === pi ? entities[open.entity] : undefined;
        return (
          <div key={pi}>
            <p>{parts}</p>
            {openEntity && open && (
              <div className="mt-3 scroll-mb-28" ref={cardRef}>
                <EntityCard entity={openEntity} wikipedia={links[open.entity]?.wikipedia ?? null} />
              </div>
            )}
          </div>
        );
      })}
      {entities.length > 0 && <p className="font-sans text-sm text-ink-soft">Underlined names are people and places. Tap one to learn more.</p>}
    </div>
  );
}
