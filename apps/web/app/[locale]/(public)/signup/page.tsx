import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { Suspense } from "react";
import { GitHubAuthCard } from "@/features/auth/components/github-auth-card";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";

// Deliberately no Developer/Client toggle (AuthGateway) here, unlike /login.
// There is no self-serve signup for clients (research.md Decision 10) — the
// only way to create a Diaphane account is via GitHub, and a client's real
// entry point is their developer's invitation, never this page. Offering a
// "Client" choice that led to a login form (with a "no account? ask your
// developer" message) on a page called "Sign up" was actively misleading —
// caught live, 2026-08-07. GitHub covers both signup and login for
// developers already (FR-001), so there's exactly one choice on this page.
export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth.SignupPage");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/images/logo-square.png" alt="" width={332} height={332} className="size-8" />
          <span className="text-base font-black tracking-tight text-primary">Diaphane</span>
        </Link>
        <Card className="w-full">
          <CardHeader>
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
          </CardHeader>
          <CardContent>
            {/* Suspense: GitHubAuthCard reads useSearchParams (the `error`
                param from a failed callback redirect), which Next.js
                requires to be boundary-wrapped on an otherwise statically
                rendered route. */}
            <Suspense fallback={null}>
              <GitHubAuthCard />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
