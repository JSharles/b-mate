"use client";

import { useTranslations } from "next-intl";

// The four sections of this page are a sequence, and nothing said so: they
// rendered as four interchangeable blocks with names for things rather than
// names for steps. A contributor arriving for the first time could not tell
// that one feeds the next, nor what any of them was for.
//
// The number is load-bearing here, not decoration — the order is the
// information. That is the one case where numbering a section earns its place.
export function StepHeading({
  step,
  titleKey,
  purposeKey,
  namespace,
}: {
  step: number;
  titleKey: string;
  purposeKey: string;
  namespace: string;
}) {
  const t = useTranslations(namespace);
  const shared = useTranslations("Projects.Documentation.Steps");

  return (
    <div className="mb-5 flex gap-4">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold text-muted-foreground"
      >
        {step}
      </span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="sr-only">{shared("stepLabel", { step })} — </span>
          {t(titleKey)}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t(purposeKey)}
        </p>
      </div>
    </div>
  );
}
