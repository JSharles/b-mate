import { use } from "react";
import { DocumentationPipelinePage } from "@/features/documentation/components/documentation-pipeline-page";

export default function ProjectDocumentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DocumentationPipelinePage projectId={id} />;
}
