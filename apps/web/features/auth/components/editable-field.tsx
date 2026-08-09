"use client";

import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { UpdateProfileRequest } from "schemas";
import { SettingsRow } from "@/shared/components/settings-row";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ApiError } from "@/shared/lib/api-client";
import { useUpdateProfile } from "../hooks";

// 2026-08-09 redesign: replaces the single form + one always-clickable
// "Save" button covering all fields at once — every field now saves (and
// fails) on its own, independent of every other field, matching the
// PATCH /auth/me endpoint's own partial-update semantics (only the field
// actually being edited is ever sent). Each row owns its own mutation
// instance, not a shared one, so editing/saving one field never affects the
// pending/error state shown on another.
export function EditableField({
  fieldKey,
  label,
  value,
  placeholder,
}: {
  fieldKey: keyof UpdateProfileRequest;
  label: string;
  value: string | null;
  placeholder?: string;
}) {
  const updateProfile = useUpdateProfile();
  const t = useTranslations("Profile");
  const tToasts = useTranslations("Toasts");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function startEditing() {
    updateProfile.reset();
    setDraft(value ?? "");
    setEditing(true);
  }

  function cancel() {
    updateProfile.reset();
    setDraft(value ?? "");
    setEditing(false);
  }

  function save() {
    const next = draft.trim() || null;
    // Nothing actually changed — close without a pointless request (and
    // without disabling Save the whole time regardless of edits, which is
    // exactly the "not in control" feeling this replaces).
    if (next === value) {
      setEditing(false);
      return;
    }
    updateProfile.mutate({ [fieldKey]: next } as UpdateProfileRequest, {
      onSuccess: () => setEditing(false),
    });
  }

  return (
    <SettingsRow title={label}>
      {editing ? (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={draft}
              placeholder={placeholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") cancel();
              }}
              disabled={updateProfile.isPending}
              className="h-8 w-56"
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={save}
              disabled={updateProfile.isPending}
              aria-label={t("save")}
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={cancel}
              disabled={updateProfile.isPending}
              aria-label={t("cancel")}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          {updateProfile.isError && (
            <p className="text-xs text-destructive">
              {updateProfile.error instanceof ApiError
                ? updateProfile.error.message
                : tToasts("genericError")}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="max-w-48 truncate">{value || placeholder}</span>
          <Pencil className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}
    </SettingsRow>
  );
}
