import type { DocumentDTO } from "@inkwell/shared";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AsWritten } from "./AsWritten";

type TabKey = "written" | "modern" | "plain" | "people" | "lens";
const TABS: { key: TabKey; label: string }[] = [
  { key: "written", label: "As Written" },
  { key: "modern", label: "Modern English" },
  { key: "plain", label: "Plain English" },
  { key: "people", label: "People & Places" },
  { key: "lens", label: "Language Lens" },
];

function Skeleton() {
  return (
    <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
      {[92, 80, 88, 70, 84].map((w, i) => (
        <div key={i} className="h-4 rounded bg-parchment-deep" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function Pending({ doc, children }: { doc: DocumentDTO; children: ReactNode }) {
  const running = !["DONE", "ERROR"].includes(doc.status);
  if (running) return <Skeleton />;
  return <p className="text-ink-soft">{children}</p>;
}

export function TranscriptTabs({ doc }: { doc: DocumentDTO }) {
  const [active, setActive] = useState<TabKey>("written");
  const refs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === active);
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    const key = TABS[next]!.key;
    setActive(key);
    refs.current[key]?.focus();
  };

  let panel: ReactNode;
  if (active === "written") {
    panel = doc.transcription ? <AsWritten transcription={doc.transcription} /> : <Pending doc={doc}>No transcription yet.</Pending>;
  } else {
    // Modern, Plain, People & Places, and Language Lens arrive in P2.
    panel = <Pending doc={doc}>This view isn't available yet.</Pending>;
  }

  return (
    <div>
      <div role="tablist" aria-label="Letter views" onKeyDown={onKeyDown} className="-mx-1 flex gap-1 overflow-x-auto border-b border-rule px-1 pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={active === t.key ? 0 : -1}
            onClick={() => setActive(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium ${
              active === t.key ? "bg-ink text-parchment" : "text-ink-soft hover:bg-parchment-deep hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="pt-5" tabIndex={0}>
        {panel}
      </div>
    </div>
  );
}
