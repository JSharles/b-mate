"use client";

import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/shared/components/ui/button";

// specs/009-developer-github-oauth: the developer path of AuthGateway — a
// real link (research.md Decision 8), not a form/mutation, since starting an
// OAuth flow requires a genuine top-level navigation to GitHub and back. The
// API endpoint itself doesn't distinguish sign-up from login (FR-001), so
// this component doesn't either.
export function GitHubAuthCard() {
  const t = useTranslations("Auth.GitHubAuthCard");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const href = `${apiUrl}/auth/github?locale=${locale}`;

  return (
    <div className="flex flex-col gap-4">
      {error === "github_email_required" && (
        <p className="text-sm text-destructive">{t("errorEmailRequired")}</p>
      )}
      {(error === "state_mismatch" || error === "github_auth_failed") && (
        <p className="text-sm text-destructive">{t("errorGeneric")}</p>
      )}
      <Button asChild className="w-full">
        <a href={href}>{t("continue")}</a>
      </Button>
    </div>
  );
}
