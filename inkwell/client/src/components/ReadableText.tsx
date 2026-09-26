// Modern / Plain English text with the letter's people and places turned into tappable names.
// Tapping a name opens its EntityCard right below the paragraph.
import type { AnnotationResult } from "@inkwell/shared";
import { Fragment, useMemo, useState, type ReactNode } from "react";
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

export function ReadableText({ text, entities, links }: { text: string; entities: Entity[]; links: { wikipedia: string | null }[] }) {
  const [open, setOpen] = useState<{ para: number; entity: number } | null>(null);
  const paragraphs = useMemo(() => text.split(/\n{2,}|\n/).filter((p) => p.trim()), [text]);

  return (
    <div className="space-y-4 font-serif text-lg leading-relaxed">
      {paragraphs.map((para, pi) => {
        const parts: ReactNode[] = [];
        let pos = 0;
        for (const m of findMentions(para, entities)) {
          parts.push(<Fragment key={`t${m.start}`}>{para.slice(pos, m.start)}</Fragment>);
          const isOpen = open?.para === pi && open.entity === m.entity;
          parts.push(
            <button
              key={`e${m.start}`}
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : { para: pi, entity: m.entity })}
              className="rounded-sm border-b-2 border-sepia/60 font-medium text-ink hover:bg-parchment-deep"
            >
              {para.slice(m.start, m.end)}
            </button>,
          );
          pos = m.end;
        }
        parts.push(<Fragment key="end">{para.slice(pos)}</Fragment>);
        const openEntity = open?.para === pi ? entities[open.entity] : undefined;
        return (
          <div key={pi}>
            <p>{parts}</p>
            {openEntity && open && (
              <div className="mt-3">
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
