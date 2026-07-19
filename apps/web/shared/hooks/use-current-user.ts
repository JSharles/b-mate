"use client";

import { useQuery } from "@tanstack/react-query";
import type { User } from "schemas";
import { getMe } from "../api/auth";
import { ApiError } from "../lib/api-client";

export const currentUserKey = ["auth", "me"] as const;

// A logged-out visitor hitting a 401 here is expected, not an error — surface
// it as `null` data so callers don't need special-case error handling, and
// so the global error toast doesn't fire on every anonymous page load.
// Any other failure (network, 5xx) still throws and is treated as a real error.
async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await getMe();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: fetchCurrentUser,
    retry: false,
  });
}
