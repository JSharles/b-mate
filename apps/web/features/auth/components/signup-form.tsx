"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { PasswordInput } from "@/shared/components/ui/password-input";
import { ApiError } from "@/shared/lib/api-client";
import { useSignup } from "../hooks";
import { createSignupFormSchema, type SignupFormValues } from "../schemas";

export function SignupForm() {
  const signup = useSignup();
  const t = useTranslations("Auth.SignupForm");
  const tToasts = useTranslations("Toasts");
  const signupFormSchema = useMemo(
    () =>
      createSignupFormSchema({
        firstNameRequired: t("firstNameRequired"),
        lastNameRequired: t("lastNameRequired"),
        emailInvalid: t("emailInvalid"),
        passwordTooShort: t("passwordTooShort"),
        passwordsDontMatch: t("passwordsDontMatch"),
      }),
    [t],
  );
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  function onSubmit(values: SignupFormValues) {
    const { confirmPassword, ...data } = values;
    signup.mutate(data);
  }

  return (
    <Form {...form}>
      {/* noValidate: without it, the browser's native email-format check
          fires first and blocks the submit event before react-hook-form/Zod
          ever runs — showing the browser's own (unlocalized) message
          instead of ours. */}
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="flex gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t("firstName")}</FormLabel>
                <FormControl>
                  <Input autoComplete="given-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t("lastName")}</FormLabel>
                <FormControl>
                  <Input autoComplete="family-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("email")}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("password")}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("confirmPassword")}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {signup.isError && (
          <p className="text-sm text-destructive">
            {signup.error instanceof ApiError ? signup.error.message : tToasts("genericError")}
          </p>
        )}
        <Button type="submit" disabled={signup.isPending}>
          {signup.isPending ? t("submitPending") : t("submit")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="underline">
            {t("logIn")}
          </Link>
        </p>
      </form>
    </Form>
  );
}
