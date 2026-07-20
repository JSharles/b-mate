import { LoginRequestSchema, SignupRequestSchema } from "schemas";
import { z } from "zod";

export const LoginFormSchema = LoginRequestSchema;
export type LoginFormValues = z.infer<typeof LoginFormSchema>;

// A factory rather than a static schema: the "passwords don't match" message
// is our own copy (not one of Zod's built-in messages, which are localized
// globally via zod/locales — see shared/components/locale-sync.tsx), so it
// needs a translation passed in from the component at render time.
export function createSignupFormSchema(passwordsDontMatchMessage: string) {
  return SignupRequestSchema.extend({
    confirmPassword: z.string().min(8),
  }).refine((data) => data.password === data.confirmPassword, {
    message: passwordsDontMatchMessage,
    path: ["confirmPassword"],
  });
}
export type SignupFormValues = z.infer<ReturnType<typeof createSignupFormSchema>>;
