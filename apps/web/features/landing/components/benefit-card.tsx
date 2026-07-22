import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface BenefitCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  span: 3 | 6;
  tone: "paper" | "ink";
  badge?: string;
}

export function BenefitCard({ icon: Icon, title, description, span, tone, badge }: BenefitCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl p-6 sm:p-8",
        span === 6 ? "sm:col-span-6" : "sm:col-span-3",
        tone === "paper"
          ? "bg-card text-foreground"
          : "border border-border bg-foreground text-background"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon className="size-6 text-primary" strokeWidth={1.75} />
        {badge ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
              tone === "paper" ? "bg-foreground/10 text-foreground/70" : "bg-background/15 text-background/70",
            )}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p
        className={cn(
          "text-sm leading-relaxed",
          tone === "paper" ? "text-muted-foreground" : "text-background/70",
        )}
      >
        {description}
      </p>
    </div>
  );
}
