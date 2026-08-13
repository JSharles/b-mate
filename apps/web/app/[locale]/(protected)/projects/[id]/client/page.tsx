import { use } from "react";
import { ClientContentPage } from "@/features/documentation/components/client-content-page";

export default function ProjectClientContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ClientContentPage projectId={id} />;
}
