"use client";

import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function ProfilePage() {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) {
    return <Skeleton className="h-24 w-full max-w-sm" />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">
        {user.firstName} {user.lastName}
      </h1>
      <p className="text-muted-foreground">{user.email}</p>
    </div>
  );
}
