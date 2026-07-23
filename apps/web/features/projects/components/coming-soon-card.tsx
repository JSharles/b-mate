import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

interface ComingSoonCardProps {
  icon: LucideIcon;
  title: string;
  message: string;
}

export function ComingSoonCard({ icon: Icon, title, message }: ComingSoonCardProps) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        {message}
      </CardContent>
    </Card>
  );
}
