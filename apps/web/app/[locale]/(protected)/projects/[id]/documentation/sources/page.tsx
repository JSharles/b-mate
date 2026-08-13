import { use } from "react";
import { DocumentarySourcesPage } from "@/features/documentation/components/documentary-sources-page";

export default function ProjectDocumentarySourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DocumentarySourcesPage projectId={id} />;
}
