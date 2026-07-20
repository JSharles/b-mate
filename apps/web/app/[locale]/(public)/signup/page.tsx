import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignupForm } from "@/features/auth/components/signup-form";

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth.SignupPage");

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>
        <SignupForm />
      </div>
    </main>
  );
}
