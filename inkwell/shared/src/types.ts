// Plain TS types and constants with no runtime schema. Schema-backed types live next to their schema in schemas.ts.

/** Statuses in which the pipeline is still working (the client keeps polling). */
export const RUNNING_STATUSES = ["QUEUED", "PREPROCESSING", "TRANSCRIBING", "ENRICHING"] as const;
