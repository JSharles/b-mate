import { CreateInvitationRequestSchema } from "schemas";
import { z } from "zod";

export const CreateInvitationFormSchema = CreateInvitationRequestSchema;
export type CreateInvitationFormValues = z.infer<typeof CreateInvitationFormSchema>;

// firstName/lastName are only required when the invitee has no account yet
// (accountExists === false) — known at render time, not encoded in the
// static shape, hence the factory rather than a static schema.
export function createAcceptInvitationFormSchema(accountExists: boolean) {
  return z.object({
    firstName: accountExists ? z.string().optional() : z.string().min(1),
    lastName: accountExists ? z.string().optional() : z.string().min(1),
    password: z.string().min(accountExists ? 1 : 8),
  });
}
export type AcceptInvitationFormValues = z.infer<
  ReturnType<typeof createAcceptInvitationFormSchema>
>;
