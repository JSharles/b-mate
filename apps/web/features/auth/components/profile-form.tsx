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

const ALL_FIELDS = ["roleTitle", "phone", "github", "linkedin", "malt", "website"] as const;
type ProfileField = (typeof ALL_FIELDS)[number];

// GitHub (a code host) and Malt (a French freelance-developer marketplace)
// only mean anything for a developer account — showing them to a client
// would just be two fields with nothing sensible to put in them.
const DEVELOPER_ONLY_FIELDS: ReadonlyArray<ProfileField> = ["github", "malt"];

function fieldsFor(accountKind: User["accountKind"]): readonly ProfileField[] {
  return accountKind === "developer"
    ? ALL_FIELDS
    : ALL_FIELDS.filter((field) => !DEVELOPER_ONLY_FIELDS.includes(field));
}

// github/linkedin/malt/website are rendered as real links on the client-
// facing identity card (TeamPanel) — a bare username there would build a
// broken URL, so the placeholder asks for a domain-inclusive value up
// front rather than silently mangling whatever's typed.
const PLACEHOLDERS: Partial<Record<ProfileField, string>> = {
  github: "github.com/username",
  linkedin: "linkedin.com/in/username",
  malt: "malt.fr/profile/username",
  website: "yoursite.com",
};

// 2026-08-09: the first (and only) way to set phone/github/roleTitle/
// linkedin/malt/website — until now these were schema fields with no
// editing UI anywhere (populated manually, e.g. via Prisma Studio). This is
// what TeamPanel's client-facing developer identity card actually reads
// from, so it needed a real form, not just storage.
export function ProfileForm({ user }: { user: User }) {
  const updateProfile = useUpdateProfile();
  const t = useTranslations("Profile");
  const tToasts = useTranslations("Toasts");
  const fields = fieldsFor(user.accountKind);
  const form = useForm<UpdateProfileRequest>({
    resolver: zodResolver(UpdateProfileRequestSchema),
    defaultValues: Object.fromEntries(
      fields.map((field) => [field, user[field] ?? ""]),
    ) as UpdateProfileRequest,
  });

  function onSubmit(values: UpdateProfileRequest) {
    // Empty string means "cleared" here, same as explicit null — the DTO's
    // null-clears/undefined-leaves-untouched convention only matters for
    // partial updates, and this form always submits every field it shows.
    // A field this account kind never sees (e.g. github for a client) is
    // simply never in `fields`, so it's never submitted and stays untouched.
    updateProfile.mutate(
      Object.fromEntries(fields.map((field) => [field, values[field] || null])) as UpdateProfileRequest,
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {fields.map((field) => (
          <FormField
            key={field}
            control={form.control}
            name={field}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{t(field)}</FormLabel>
                <FormControl>
                  <Input {...formField} value={formField.value ?? ""} placeholder={PLACEHOLDERS[field]} />
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
