"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
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
import { ApiError } from "@/shared/lib/api-client";
import { useAcceptInvitation } from "../hooks";
import { createAcceptInvitationFormSchema, type AcceptInvitationFormValues } from "../schemas";

interface AcceptInvitationFormProps {
  token: string;
  email: string;
  accountExists: boolean;
}

export function AcceptInvitationForm({ token, email, accountExists }: AcceptInvitationFormProps) {
  const acceptInvitation = useAcceptInvitation(token);
  const t = useTranslations("Invite.AcceptInvitationForm");
  const tToasts = useTranslations("Toasts");
  const form = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(createAcceptInvitationFormSchema(accountExists)),
    defaultValues: { firstName: "", lastName: "", password: "" },
  });

  function onSubmit(values: AcceptInvitationFormValues) {
    acceptInvitation.mutate(accountExists ? { password: values.password } : values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("email")}</span>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>

        {!accountExists && (
          <>
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
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
                <FormItem>
                  <FormLabel>{t("lastName")}</FormLabel>
                  <FormControl>
                    <Input autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("password")}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete={accountExists ? "current-password" : "new-password"}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {acceptInvitation.isError && (
          <p className="text-sm text-destructive">
            {acceptInvitation.error instanceof ApiError
              ? acceptInvitation.error.message
              : tToasts("genericError")}
          </p>
        )}

        <Button type="submit" disabled={acceptInvitation.isPending}>
          {acceptInvitation.isPending
            ? t("submitPending")
            : accountExists
              ? t("logIn")
              : t("createAccount")}
        </Button>
      </form>
    </Form>
  );
}
