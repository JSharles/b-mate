import type {
  AcceptInvitationRequest,
  CreateInvitationRequest,
  Invitation,
  InvitationDetails,
  User,
} from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function listInvitations(projectId: string) {
  return apiFetch<Invitation[]>(`/projects/${projectId}/invitations`);
}

export function createInvitation(projectId: string, data: CreateInvitationRequest) {
  return apiFetch<Invitation>(`/projects/${projectId}/invitations`, {
    method: "POST",
    body: data,
  });
}

export function getInvitationByToken(token: string) {
  return apiFetch<InvitationDetails>(`/invitations/${token}`);
}

export function acceptInvitation(token: string, data: AcceptInvitationRequest) {
  return apiFetch<User>(`/invitations/${token}/accept`, { method: "POST", body: data });
}

export function cancelInvitation(projectId: string, invitationId: string) {
  return apiFetch<Invitation>(`/projects/${projectId}/invitations/${invitationId}/cancel`, {
    method: "PATCH",
  });
}

export function resendInvitation(projectId: string, invitationId: string) {
  return apiFetch<Invitation>(`/projects/${projectId}/invitations/${invitationId}/resend`, {
    method: "POST",
  });
}
