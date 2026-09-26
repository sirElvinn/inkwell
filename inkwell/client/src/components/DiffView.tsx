import { normalizeLoose } from "@inkwell/shared";
import { diffChars } from "diff";

/**
 * Character-level diff of the normalized reference (Founders Online) against Inkwell's transcription.
 *   red + strikethrough = in the expert transcription but missed by Inkwell
 *   green + underline   = produced by Inkwell but not in the expert transcription
 */
export function DiffView({ prediction, reference }: { prediction: string; reference: string }) {
  const parts = diffChars(normalizeLoose(reference), normalizeLoose(prediction));
  return (
    <div>
      <p className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span><del className="bg-red-100 text-red-900 decoration-2">missed</del> = in the expert transcription, not in Inkwell's</span>
        <span><ins className="bg-green-100 text-green-900 no-underline decoration-2 [text-decoration-line:underline]">extra</ins> = in Inkwell's, not in the expert's</span>
      </p>
      <p className="max-h-96 overflow-auto rounded-xl border border-rule bg-card p-4 font-serif leading-relaxed">
        {parts.map((p, i) =>
          p.removed ? (
            <del key={i} className="bg-red-100 text-red-900 decoration-2">{p.value}</del>
          ) : p.added ? (
            <ins key={i} className="bg-green-100 text-green-900 decoration-2 [text-decoration-line:underline]">{p.value}</ins>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
      </p>
    </div>
  );
}
