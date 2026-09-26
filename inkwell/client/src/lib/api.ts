// Typed fetch helpers. Every response is validated with the shared zod schemas,
// so a server/client mismatch fails loudly instead of rendering garbage.
import { ApiError, AudioResponse, CreateDocumentResponse, DocumentDTO, DocumentSummary, HealthResponse, type NarrationVariant } from "@inkwell/shared";
import { z } from "zod";

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<S extends z.ZodType>(schema: S, path: string, init?: RequestInit): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiRequestError(0, "network", "Can't reach the server. Check your connection and try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiError.safeParse(body);
    const err = parsed.success ? parsed.data.error : { code: "http_error", message: `Request failed (${res.status}).` };
    throw new ApiRequestError(res.status, err.code, err.message);
  }
  return schema.parse(body);
}

export const api = {
  health: () => request(HealthResponse, "/api/health"),
  getDocument: (id: string) => request(DocumentDTO, `/api/documents/${encodeURIComponent(id)}`),
  listExamples: () => request(z.array(DocumentSummary), "/api/documents?source=example"),
  retryDocument: (id: string) =>
    request(CreateDocumentResponse, `/api/documents/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  narrate: (id: string, variant: NarrationVariant) =>
    request(AudioResponse, `/api/documents/${encodeURIComponent(id)}/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant }),
    }),
  createDocument: (file: File) => {
    const form = new FormData();
    form.append("image", file);
    return request(CreateDocumentResponse, "/api/documents", { method: "POST", body: form });
  },
};
