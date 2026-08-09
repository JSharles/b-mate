import type { ReactNode } from "react";

// 2026-08-09: shared building block for the project page's "classic
// settings page" layout (developer/contributor view) — a plain, borderless
// row (bold label + muted description on the left, the actual control on
// the right, a thin divider between rows), replacing the earlier
// Card-per-section bento. Cross-feature (used by board-connections,
// notion-connection, projects, resources), so it lives in shared/ per
// Constitution III rather than inside any one feature.
export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="font-medium text-foreground">{title}</span>
        {description && <div className="text-muted-foreground">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
