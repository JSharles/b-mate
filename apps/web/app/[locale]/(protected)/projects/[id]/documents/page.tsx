import { use } from "react";
import { DocumentaryBasePage } from "@/features/documentation/components/documentary-base-page";

export default function ProjectDocumentaryBasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DocumentaryBasePage projectId={id} />;
}
