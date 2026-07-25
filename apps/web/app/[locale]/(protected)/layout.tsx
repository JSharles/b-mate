import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { redirect } from "@/i18n/navigation";
import { getMe } from "@/shared/api/auth";
import { ApiError } from "@/shared/lib/api-client";
import { TopNav } from "@/shared/components/top-nav";

// Private, per-user pages — never indexed. See also app/robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProtectedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieStore = await cookies();

  let user;
  try {
    user = await getMe({ cookie: cookieStore.toString() });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect({ href: "/login", locale });
    }
    throw error;
  }

  return (
    // h-dvh + flex-1 here, not min-h-full: body's `min-h-full` alone does
    // not reliably resolve as a definite height for this div's own
    // percentage-based sizing in every browser (measured directly — a plain
    // min-h-full child came out shorter than its flex-column parent despite
    // the parent filling the viewport). flex-grow is a robust mechanism
    // that doesn't depend on that percentage-resolution edge case. No
    // overflow-hidden here — this layout wraps every protected page, and
    // pages with more content than fits (e.g. Home with many projects)
    // must still be able to scroll normally.
    <div className="flex h-dvh flex-col">
      <TopNav user={user} />
      <div className="flex flex-1 flex-col overflow-y-auto p-6">{children}</div>
    </div>
  );
}
