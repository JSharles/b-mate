import type { ReactNode } from "react";

// Small uppercase group label above a cluster of related SettingsRows (e.g.
// "Tools" above Board + Notion, "Preferences" above Timezone/Date format/
// Language) — only used above genuine multi-row groups; a single-row
// section's own SettingsRow title already labels it, so it doesn't need
// one of these too.
export function SettingsSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="pt-6 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}
