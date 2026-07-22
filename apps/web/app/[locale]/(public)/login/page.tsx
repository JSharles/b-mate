import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { LoginForm } from "@/features/auth/components/login-form";
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
          <Image src="/images/brand-logo.png" alt="" width={28} height={28} className="size-7" />
          <span className="text-base font-black tracking-tight">b-mate</span>
        </Link>
        <Card className="w-full">
          <CardHeader>
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
