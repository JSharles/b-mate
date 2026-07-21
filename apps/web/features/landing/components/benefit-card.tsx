import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface BenefitCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  span: 3 | 6;
  tone: "paper" | "ink";
}

export function BenefitCard({ icon: Icon, title, description, span, tone }: BenefitCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl p-6 sm:p-8",
        span === 6 ? "sm:col-span-6" : "sm:col-span-3",
        tone === "paper"
          ? "bg-landing-paper text-landing-ink"
          : "border border-landing-ink-line bg-landing-ink-soft text-landing-paper"
      )}
    >
      <Icon className="size-6 text-landing-rust" strokeWidth={1.75} />
      <h3 className="text-lg font-bold">{title}</h3>
      <p
        className={cn(
          "text-sm leading-relaxed",
          tone === "paper" ? "text-landing-ink/70" : "text-landing-paper/70",
        )}
      >
        {description}
      </p>
    </div>
  );
}
