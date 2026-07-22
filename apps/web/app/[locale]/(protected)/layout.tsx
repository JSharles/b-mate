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
    <div className="flex min-h-full flex-col">
      <TopNav user={user} />
      <div className="flex flex-1 flex-col p-6">{children}</div>
    </div>
  );
}
