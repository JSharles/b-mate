"use client";

import { useTranslations } from "next-intl";
import { CreateProjectForm } from "@/features/projects/components/create-project-form";

export default function NewProjectPage() {
  const t = useTranslations("Projects.NewProjectPage");

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>
      <CreateProjectForm />
    </div>
  );
}
