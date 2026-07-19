import { LoginRequestSchema, SignupRequestSchema } from "schemas";
import { z } from "zod";

export const LoginFormSchema = LoginRequestSchema;
export type LoginFormValues = z.infer<typeof LoginFormSchema>;

export const SignupFormSchema = SignupRequestSchema
  .extend({
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type SignupFormValues = z.infer<typeof SignupFormSchema>;
