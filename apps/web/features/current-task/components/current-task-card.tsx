"use client";

import { ListTodo } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCurrentTask } from "../hooks";

export function CurrentTaskCard({ projectId }: { projectId: string }) {
  const { data: items, isPending } = useCurrentTask(projectId);
  const t = useTranslations("Projects.CurrentTaskCard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : !items || items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ListTodo className="size-4 shrink-0" />
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.title} className="flex flex-col gap-1">
                <span className="font-medium">{item.title}</span>
                {item.description && (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
