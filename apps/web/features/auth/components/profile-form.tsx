"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { UpdateProfileRequestSchema, type UpdateProfileRequest, type User } from "schemas";
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
import { useUpdateProfile } from "../hooks";

const FIELDS = ["roleTitle", "phone", "github", "linkedin", "malt", "website"] as const;

// 2026-08-09: the first (and only) way to set phone/github/roleTitle/
// linkedin/malt/website — until now these were schema fields with no
// editing UI anywhere (populated manually, e.g. via Prisma Studio). This is
// what TeamPanel's client-facing developer identity card actually reads
// from, so it needed a real form, not just storage.
export function ProfileForm({ user }: { user: User }) {
  const updateProfile = useUpdateProfile();
  const t = useTranslations("Profile");
  const tToasts = useTranslations("Toasts");
  const form = useForm({
    resolver: zodResolver(UpdateProfileRequestSchema),
    defaultValues: {
      roleTitle: user.roleTitle ?? "",
      phone: user.phone ?? "",
      github: user.github ?? "",
      linkedin: user.linkedin ?? "",
      malt: user.malt ?? "",
      website: user.website ?? "",
    },
  });

  function onSubmit(values: UpdateProfileRequest) {
    // Empty string means "cleared" here, same as explicit null — the DTO's
    // null-clears/undefined-leaves-untouched convention only matters for
    // partial updates, and this form always submits every field.
    updateProfile.mutate(
      Object.fromEntries(FIELDS.map((field) => [field, values[field] || null])) as UpdateProfileRequest,
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {FIELDS.map((field) => (
          <FormField
            key={field}
            control={form.control}
            name={field}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{t(field)}</FormLabel>
                <FormControl>
                  <Input {...formField} value={formField.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        {updateProfile.isError && (
          <p className="text-sm text-destructive">
            {updateProfile.error instanceof ApiError
              ? updateProfile.error.message
              : tToasts("genericError")}
          </p>
        )}
        <Button type="submit" disabled={updateProfile.isPending} className="w-fit">
          {updateProfile.isPending ? t("submitPending") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
