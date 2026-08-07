import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { Suspense } from "react";
import { AuthGateway } from "@/features/auth/components/auth-gateway";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth.LoginPage");

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
            {/* Suspense: AuthGateway's developer path (GitHubAuthCard) reads
                useSearchParams (the `error` param from a failed callback
                redirect), which Next.js requires to be boundary-wrapped on
                an otherwise statically rendered route. */}
            <Suspense fallback={null}>
              <AuthGateway />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
