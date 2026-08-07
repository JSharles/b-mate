"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { GitHubAuthCard } from "./github-auth-card";
import { LoginForm } from "./login-form";

type AccountKind = "developer" | "client";

// Single entry point for both /login and /signup. Mirrors the toggle the old
// self-serve SignupForm used to have — familiar, one page, one obvious
// choice, no hidden/bookmark-only route for clients (specs/009-developer-
// github-oauth research.md Decision 10, revised again 2026-08-07).
//
// Two things a first pass got wrong, fixed here:
// - No default selection. Pre-selecting "developer" put GitHub content in
//   front of every visitor, including non-technical clients, before they'd
//   done anything — exactly the kind of technical friction this product
//   exists to remove for them. Neither choice is presumed.
// - No layout jump on switch. The two panels (a single button vs. a full
//   email/password form) are wildly different heights; swapping the mounted
//   element outright made the card resize abruptly. Both panels are always
//   mounted, stacked in one grid cell (`col-start-1 row-start-1`) — CSS Grid
//   sizes that cell to the *taller* of the two automatically, so switching
//   only ever cross-fades opacity, never resizes the card. The outer
//   0fr/1fr grid-template-rows track handles the one real size change (the
//   whole panel area appearing after nothing was chosen) with a genuine
//   height animation, since `auto` can't be transitioned directly in CSS.
export function AuthGateway() {
  const t = useTranslations("Auth.AuthGateway");
  const [kind, setKind] = useState<AccountKind | null>(null);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("prompt")}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={kind === "developer" ? "default" : "outline"}
            aria-pressed={kind === "developer"}
            className="flex-1"
            onClick={() => setKind("developer")}
          >
            {t("developer")}
          </Button>
          <Button
            type="button"
            variant={kind === "client" ? "default" : "outline"}
            aria-pressed={kind === "client"}
            className="flex-1"
            onClick={() => setKind("client")}
          >
            {t("client")}
          </Button>
        </div>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: kind ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="grid pt-1">
            <div
              data-testid="developer-panel"
              inert={kind !== "developer"}
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-200",
                kind === "developer" ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <GitHubAuthCard />
            </div>
            <div
              data-testid="client-panel"
              inert={kind !== "client"}
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-200",
                kind === "client" ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
