import { LoginRequestSchema } from "schemas";
import { z } from "zod";

// Factories rather than static schemas: Zod's own built-in messages (via
// zod/locales, see shared/components/locale-sync.tsx) are technical internals
// ("Too small: expected string to have >=8 characters"), not copy a
// non-technical client should ever see — every field here gets its own
// translated message instead, passed in from the component at render time.
export interface LoginFormMessages {
  emailInvalid: string;
  passwordRequired: string;
}

export function createLoginFormSchema(messages: LoginFormMessages) {
  return LoginRequestSchema.extend({
    email: z.email({ message: messages.emailInvalid }),
    password: z.string().min(1, messages.passwordRequired),
  });
}
export type LoginFormValues = z.infer<ReturnType<typeof createLoginFormSchema>>;
