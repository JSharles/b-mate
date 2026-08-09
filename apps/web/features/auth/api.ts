import type { LoginRequest, UpdateProfileRequest, User } from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function login(data: LoginRequest) {
  return apiFetch<User>("/auth/login", { method: "POST", body: data });
}

export function logout() {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}

export function updateProfile(data: UpdateProfileRequest) {
  return apiFetch<User>("/auth/me", { method: "PATCH", body: data });
}
