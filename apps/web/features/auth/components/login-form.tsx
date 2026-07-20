"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
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
import { ApiError } from "@/shared/lib/api-client";
import { useLogin } from "../hooks";
import { LoginFormSchema, type LoginFormValues } from "../schemas";

export function LoginForm() {
  const login = useLogin();
  const t = useTranslations("Auth.LoginForm");
  const tToasts = useTranslations("Toasts");
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginFormValues) {
    login.mutate(values);
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
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {login.isError && (
          <p className="text-sm text-destructive">
            {login.error instanceof ApiError ? login.error.message : tToasts("genericError")}
          </p>
        )}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? t("submitPending") : t("submit")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/signup" className="underline">
            {t("signUp")}
          </Link>
        </p>
      </form>
    </Form>
  );
}
