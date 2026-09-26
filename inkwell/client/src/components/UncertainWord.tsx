import { useId, useState } from "react";

export interface Uncertain {
  reading: string;
  alternatives: string[];
  reason: string;
}

/**
 * A word the model wasn't sure about. Signaled by a dotted amber underline AND a small "?" marker,
 * so it never relies on color alone. The explanation shows on hover, keyboard focus, or tap.
 */
export function UncertainWord({ text, info }: { text: string; info: Uncertain }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="cursor-help rounded-sm underline decoration-amber decoration-dotted decoration-2 underline-offset-4 hover:bg-amber/25 focus-visible:bg-amber/25"
        aria-describedby={tipId}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        {text}
        <sup className="ml-0.5 font-sans text-[0.6em] text-sepia-dark">?</sup>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={`absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-rule bg-card p-3 font-sans text-sm leading-snug text-ink shadow-lg ${open ? "block" : "hidden"}`}
      >
        <span className="block font-medium">Uncertain reading</span>
        {info.alternatives.length > 0 && (
          <span className="mt-1 block">Could also be: {info.alternatives.map((a) => `“${a}”`).join(" or ")}</span>
        )}
        <span className="mt-1 block text-ink-soft">{info.reason}</span>
      </span>
    </span>
  );
}
