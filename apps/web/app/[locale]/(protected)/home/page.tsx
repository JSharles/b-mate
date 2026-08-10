"use client";

import { ProjectList } from "@/features/projects/components/project-list";
import { WelcomeCard } from "@/features/home/components/welcome-card";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

export default function HomePage() {
  const { data: user, isPending } = useCurrentUser();

  return (
    // gap-1 between the greeting and ProjectList's own h1 (impeccable
    // polish pass, 2026-08-10) — tight enough to read as one page-intro
    // block (a quiet preamble directly above the real title) rather than
    // two independently-spaced sections at the page's usual gap-6 rhythm.
    <div className="flex flex-col gap-1">
      <WelcomeCard user={user} isPending={isPending} />
      <ProjectList />
    </div>
  );
}
