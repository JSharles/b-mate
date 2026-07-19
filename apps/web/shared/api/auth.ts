import type { User } from "schemas";
import { apiFetch } from "../lib/api-client";

// `cookie` is only needed when called from a Server Component, which has no
// browser to attach the session cookie for it — pass the forwarded
// `Cookie` header there. Client Components can omit it.
export function getMe(options?: { cookie?: string }) {
  return apiFetch<User>("/auth/me", {
    headers: options?.cookie ? { Cookie: options.cookie } : undefined,
  });
}
