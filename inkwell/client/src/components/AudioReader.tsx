// Bottom audio bar: Listen / Pause, speed, and live word highlighting.
//
// Highlighting: every animation frame we read audio.currentTime, find the last word in the current
// chunk whose start time has passed (binary search), and add a class to its <span data-w="k">
// elements in the text of the variant being read. We touch the DOM directly instead of re-rendering
// React 60 times a second.
import type { AudioResponse, NarrationVariant, WordTiming } from "@inkwell/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "../lib/api";

const SPEEDS = [0.75, 1, 1.25, 1.5];
const LABEL: Record<NarrationVariant, string> = { modern: "Modern English", plain: "Plain English" };
const SPEAKING = "is-speaking";

/** Index of the last word in `chunk` that has started by time t (-1 if none). Words are sorted by chunk, then start. */
function wordAt(words: WordTiming[], chunk: number, t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid]!;
    if (w.chunk < chunk || (w.chunk === chunk && w.start <= t)) {
      if (w.chunk === chunk) found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

type Status = "idle" | "loading" | "playing" | "paused";

export function AudioReader({ docId, variant, onPlay }: { docId: string; variant: NarrationVariant; onPlay: (v: NarrationVariant) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const clips = useRef<Partial<Record<NarrationVariant, AudioResponse>>>({});
  const audio = useRef<HTMLAudioElement | null>(null);
  const chunk = useRef(0);
  const frame = useRef(0);
  const lastWord = useRef(-1);

  const clearHighlight = useCallback(() => {
    document.querySelectorAll(`.${SPEAKING}`).forEach((el) => el.classList.remove(SPEAKING));
    lastWord.current = -1;
  }, []);

  const highlight = useCallback((v: NarrationVariant, k: number) => {
    if (k === lastWord.current) return;
    clearHighlight();
    lastWord.current = k;
    if (k < 0) return;
    const els = document.querySelectorAll<HTMLElement>(`[data-narration="${v}"] [data-w="${k}"]`);
    els.forEach((el) => el.classList.add(SPEAKING));
    const first = els[0];
    if (first) {
      const r = first.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 110) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        first.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      }
    }
  }, [clearHighlight]);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    audio.current?.pause();
    audio.current = null;
    chunk.current = 0;
    clearHighlight();
    setStatus("idle");
  }, [clearHighlight]);

  // Switching variant or letter, or leaving the page, stops playback.
  useEffect(() => stop, [variant, docId, stop]);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const playChunk = useCallback((clip: AudioResponse, v: NarrationVariant, index: number) => {
    const el = new Audio(clip.audioUrls[index]);
    el.playbackRate = speed;
    audio.current = el;
    chunk.current = index;
    const tick = () => {
      highlight(v, wordAt(clip.words, index, el.currentTime));
      frame.current = requestAnimationFrame(tick);
    };
    el.onplay = () => {
      setStatus("playing");
      frame.current = requestAnimationFrame(tick);
    };
    // Fallback: animation frames pause when the tab isn't visible, but timeupdate still fires (~4×/s).
    el.ontimeupdate = () => highlight(v, wordAt(clip.words, index, el.currentTime));
    el.onpause = () => cancelAnimationFrame(frame.current);
    el.onended = () => {
      cancelAnimationFrame(frame.current);
      if (index + 1 < clip.audioUrls.length) playChunk(clip, v, index + 1);
      else stop();
    };
    el.onerror = () => {
      setError("The audio couldn't be played.");
      stop();
    };
    void el.play().catch(() => {
      setError("Your browser blocked playback. Press Listen again.");
      stop();
    });
  }, [highlight, speed, stop]);

  const onListen = async () => {
    setError(null);
    if (status === "playing") {
      audio.current?.pause();
      setStatus("paused");
      return;
    }
    if (status === "paused" && audio.current) {
      void audio.current.play();
      return;
    }
    onPlay(variant); // make sure the text being read is on screen
    let clip = clips.current[variant];
    if (!clip) {
      setStatus("loading");
      try {
        clip = await api.narrate(docId, variant);
        clips.current[variant] = clip;
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : "Narration failed. Please try again.");
        setStatus("idle");
        return;
      }
    }
    playChunk(clip, variant, 0);
  };

  const buttonLabel = status === "playing" ? "Pause" : status === "paused" ? "Resume" : status === "loading" ? "Preparing…" : "Listen";

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-card/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={onListen}
          disabled={status === "loading"}
          className="inline-flex min-h-11 min-w-32 items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-parchment disabled:opacity-70"
        >
          <span aria-hidden="true">{status === "playing" ? "❚❚" : "▶"}</span>
          {buttonLabel}
        </button>
        {(status === "playing" || status === "paused") && (
          <button type="button" onClick={stop} className="rounded-full px-3 py-2 text-sm font-medium text-ink-soft hover:bg-parchment-deep">
            Stop
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-md border border-rule bg-card px-2 py-1 text-ink">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </label>
        <p className="min-w-0 flex-1 text-sm text-ink-soft" aria-live="polite">
          {error ? <span className="text-sepia-dark">{error}</span> : <>Reading the {LABEL[variant]} version · AI narrator voice</>}
        </p>
      </div>
    </div>
  );
}
