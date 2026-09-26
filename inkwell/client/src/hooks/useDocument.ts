// Polls GET /api/documents/:id every 1.5 s until the pipeline finishes (DONE or ERROR).
// Stops on unmount, and never has two requests in flight at once.
import { RUNNING_STATUSES, type DocumentDTO } from "@inkwell/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "../lib/api";

const POLL_MS = 1500;
const isRunning = (d: DocumentDTO | null) => !d || (RUNNING_STATUSES as readonly string[]).includes(d.status);

export function useDocument(id: string) {
  const [doc, setDoc] = useState<DocumentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0); // bump to restart polling (after a retry)
  const docRef = useRef<DocumentDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    docRef.current = null;

    const tick = async () => {
      try {
        const next = await api.getDocument(id);
        if (cancelled) return;
        docRef.current = next;
        setDoc(next);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiRequestError ? e.message : "Something went wrong loading this letter.");
        if (e instanceof ApiRequestError && e.status === 404) return; // no point polling a missing doc
      }
      if (!cancelled && isRunning(docRef.current)) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, pollKey]);

  const retry = useCallback(async () => {
    setError(null);
    await api.retryDocument(id);
    setPollKey((k) => k + 1);
  }, [id]);

  return { doc, error, retry };
}
