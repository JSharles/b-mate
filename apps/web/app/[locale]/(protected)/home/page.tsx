"use client";

import { ProjectList } from "@/features/projects/components/project-list";
import { WelcomeCard } from "@/features/home/components/welcome-card";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

export default function HomePage() {
  const { data: user, isPending } = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <WelcomeCard user={user} isPending={isPending} />
      <ProjectList />
    </div>
  );
}
