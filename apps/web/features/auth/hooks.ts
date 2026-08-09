"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { currentUserKey } from "@/shared/hooks/use-current-user";
import { login, logout, updateProfile } from "./api";

// Errors are surfaced inline in the form (see LoginForm), not as a generic
// toast — skipGlobalErrorToast opts this out of that default.
export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: login,
    meta: { skipGlobalErrorToast: true },
    onSuccess: (user) => {
      // A browser tab keeps one QueryClient for its whole lifetime, and
      // resource keys (project, invitations, members...) carry no user
      // identity, so a previous session's cached data would otherwise leak
      // into this new account's views — clear everything first.
      queryClient.clear();
      queryClient.setQueryData(currentUserKey, user);
      router.push("/home");
    },
  });
}

// Error is surfaced inline in the form (see ProfileForm), not as a generic
// toast — skipGlobalErrorToast opts this out of that default. Success has no
// inline equivalent (the form doesn't navigate away or reset), so it still
// gets the generic success toast, same as useLogout below.
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const t = useTranslations("Toasts");

  return useMutation({
    mutationFn: updateProfile,
    meta: { skipGlobalErrorToast: true, successMessage: t("profileSaved") },
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserKey, user);
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
      // See useLogin — same tab-lifetime cache leak risk on identity change.
      queryClient.clear();
      queryClient.setQueryData(currentUserKey, null);
      router.push("/");
    },
  });
}
