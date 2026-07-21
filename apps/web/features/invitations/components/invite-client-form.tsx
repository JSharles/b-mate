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
import { useCreateInvitation } from "../hooks";
import { CreateInvitationFormSchema, type CreateInvitationFormValues } from "../schemas";

export function InviteClientForm({ projectId }: { projectId: string }) {
  const createInvitation = useCreateInvitation(projectId);
  const t = useTranslations("Projects.InviteClientForm");
  const tToasts = useTranslations("Toasts");
  const form = useForm<CreateInvitationFormValues>({
    resolver: zodResolver(CreateInvitationFormSchema),
    defaultValues: { email: "" },
  });

  function onSubmit(values: CreateInvitationFormValues) {
    createInvitation.mutate(values, { onSuccess: () => form.reset() });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t("email")}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={createInvitation.isPending}>
            {createInvitation.isPending ? t("submitPending") : t("submit")}
          </Button>
        </div>
        {createInvitation.isError && (
          <p className="text-sm text-destructive">
            {createInvitation.error instanceof ApiError
              ? createInvitation.error.message
              : tToasts("genericError")}
          </p>
        )}
      </form>
    </Form>
  );
}
