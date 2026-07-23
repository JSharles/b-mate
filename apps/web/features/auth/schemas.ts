import { LoginRequestSchema, SignupRequestSchema } from "schemas";
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

export interface SignupFormMessages {
  firstNameRequired: string;
  lastNameRequired: string;
  emailInvalid: string;
  passwordTooShort: string;
  passwordsDontMatch: string;
  accountKindRequired: string;
}

export function createSignupFormSchema(messages: SignupFormMessages) {
  return SignupRequestSchema.extend({
    firstName: z.string().min(1, messages.firstNameRequired),
    lastName: z.string().min(1, messages.lastNameRequired),
    email: z.email({ message: messages.emailInvalid }),
    password: z.string().min(8, messages.passwordTooShort),
    confirmPassword: z.string().min(8, messages.passwordTooShort),
    accountKind: z.enum(["developer", "client"], {
      message: messages.accountKindRequired,
    }),
  }).refine((data) => data.password === data.confirmPassword, {
    message: messages.passwordsDontMatch,
    path: ["confirmPassword"],
  });
}
export type SignupFormValues = z.infer<ReturnType<typeof createSignupFormSchema>>;
