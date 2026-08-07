import type { LoginRequest, User } from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function login(data: LoginRequest) {
  return apiFetch<User>("/auth/login", { method: "POST", body: data });
}

export function logout() {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}
