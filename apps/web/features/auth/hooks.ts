"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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
      // Clear every cached query first — a browser tab keeps one QueryClient
      // for its whole lifetime, and resource keys (project, invitations,
      // members...) carry no user identity, so a previous session's cached
      // data would otherwise leak into this new account's views.
      queryClient.clear();
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
      // See useSignup — same tab-lifetime cache leak risk on identity change.
      queryClient.clear();
      queryClient.setQueryData(currentUserKey, user);
      router.push("/home");
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations("Toasts");

  return useMutation({
    mutationFn: logout,
    meta: { successMessage: t("loggedOut") },
    onSuccess: () => {
      // See useSignup — same tab-lifetime cache leak risk on identity change.
      queryClient.clear();
      queryClient.setQueryData(currentUserKey, null);
      router.push("/");
    },
  });
}
