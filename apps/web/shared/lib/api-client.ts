const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  // The API answers a refusal with a stable `code` and no prose (its own
  // convention: the wording belongs to whichever screen is asking). Carrying it
  // here is what lets a screen tell one 400 from another — mapping every 400 to
  // a single sentence turned a serialisation bug into "add a document first".
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiFetchOptions = Omit<RequestInit, "body"> & { body?: unknown };

// Single entry point for every call to apps/api. Client Components rely on
// `credentials: "include"` to send the session cookie automatically; Server
// Components have no browser to do that for them and must forward the
// incoming request's cookie explicitly via `headers: { Cookie: ... }`.
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const rawMessage =
      data && typeof data === "object" && "message" in data
        ? (data as { message: unknown }).message
        : undefined;
    const message = Array.isArray(rawMessage) ? rawMessage.join(", ") : (rawMessage ?? res.statusText);
    const code =
      data && typeof data === "object" && "code" in data
        ? String((data as { code: unknown }).code)
        : undefined;
    throw new ApiError(String(message), res.status, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  // NestJS sends an empty body (no Content-Type) for a controller returning
  // `null`/`undefined` regardless of status code — res.json() would throw on
  // that, so treat any empty body the same as 204 rather than only checking
  // the status.
  const text = await res.text();
  if (text.length === 0) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
