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
import { useCreateProject } from "../hooks";
import { CreateProjectFormSchema, type CreateProjectFormValues } from "../schemas";

export function CreateProjectForm({ onCreated }: { onCreated?: () => void }) {
  const createProject = useCreateProject();
  const t = useTranslations("Projects.CreateProjectForm");
  const tToasts = useTranslations("Toasts");
  const form = useForm<CreateProjectFormValues>({
    resolver: zodResolver(CreateProjectFormSchema),
    defaultValues: { title: "" },
  });

  function onSubmit(values: CreateProjectFormValues) {
    createProject.mutate(values, { onSuccess: () => onCreated?.() });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("title")}</FormLabel>
              <FormControl>
                <Input autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {createProject.isError && (
          <p className="text-sm text-destructive">
            {createProject.error instanceof ApiError
              ? createProject.error.message
              : tToasts("genericError")}
          </p>
        )}
        <Button type="submit" disabled={createProject.isPending}>
          {createProject.isPending ? t("submitPending") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
