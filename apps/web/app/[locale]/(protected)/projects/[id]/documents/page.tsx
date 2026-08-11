"use client";

import { use } from "react";
import { DocumentManagementPage } from "@/features/documentation/components/document-management-page";

export default function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DocumentManagementPage projectId={id} />;
}
