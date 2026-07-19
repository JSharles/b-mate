"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { currentUserKey } from "@/shared/hooks/use-current-user";
import { login, logout, signup } from "./api";

// Errors are surfaced inline in the forms (see LoginForm/SignupForm), not as
// a generic toast — skipGlobalErrorToast opts these two out of that default.
export function useSignup() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: signup,
    meta: { skipGlobalErrorToast: true },
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserKey, user);
      router.push("/home");
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: login,
    meta: { skipGlobalErrorToast: true },
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserKey, user);
      router.push("/home");
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: logout,
    meta: { successMessage: "Logged out" },
    onSuccess: () => {
      queryClient.setQueryData(currentUserKey, null);
      router.push("/");
    },
  });
}
