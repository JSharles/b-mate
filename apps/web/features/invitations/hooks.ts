"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcceptInvitationRequest, CreateInvitationRequest } from "schemas";
import { useRouter } from "@/i18n/navigation";
import { currentUserKey } from "@/shared/hooks/use-current-user";
import { ApiError } from "@/shared/lib/api-client";
import {
  acceptInvitation,
  createInvitation,
  getInvitationByToken,
  listInvitations,
} from "./api";

export const invitationsKey = (projectId: string) =>
  ["projects", projectId, "invitations"] as const;

export function useInvitations(projectId: string) {
  return useQuery({
    queryKey: invitationsKey(projectId),
    queryFn: () => listInvitations(projectId),
  });
}

// Error is surfaced inline in the form (see InviteClientForm), not as a
// generic toast — skipGlobalErrorToast opts this out of that default.
export function useCreateInvitation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInvitationRequest) => createInvitation(projectId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationsKey(projectId) });
    },
  });
}

export const invitationDetailsKey = (token: string) => ["invitations", token] as const;

// An unknown/invalid token is an expected outcome for this page (a stale
// bookmark, a mistyped link), not an error — surface it as `null` data, the
// same pattern as useCurrentUser's handling of an anonymous visitor's 401.
async function fetchInvitationDetails(token: string) {
  try {
    return await getInvitationByToken(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function useInvitationDetails(token: string) {
  return useQuery({
    queryKey: invitationDetailsKey(token),
    queryFn: () => fetchInvitationDetails(token),
    retry: false,
  });
}

// Error is surfaced inline in the form (see AcceptInvitationForm), not as a
// generic toast — skipGlobalErrorToast opts this out of that default.
export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (data: AcceptInvitationRequest) => acceptInvitation(token, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserKey, user);
      router.push("/home");
    },
  });
}
