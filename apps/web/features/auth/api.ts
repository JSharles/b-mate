import type { LoginRequest, SignupRequest, User } from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function signup(data: SignupRequest) {
  return apiFetch<User>("/auth/signup", { method: "POST", body: data });
}

export function login(data: LoginRequest) {
  return apiFetch<User>("/auth/login", { method: "POST", body: data });
}

export function logout() {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}
