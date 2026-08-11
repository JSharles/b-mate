import { z } from "zod";

// Product-wide, provider-independent taxonomy. Order is part of the wire/UI
// contract and `other` deliberately remains last.
export const DOCUMENTATION_CATEGORY_KEYS = [
  "overview",
  "how_it_works",
  "planning",
  "other",
] as const;

export const DocumentationCategoryKeySchema = z.enum(
  DOCUMENTATION_CATEGORY_KEYS,
);
export type DocumentationCategoryKey = z.infer<
  typeof DocumentationCategoryKeySchema
>;

export interface DocumentationCategory {
  key: DocumentationCategoryKey;
  labelEn: string;
  labelFr: string;
}

export const DOCUMENTATION_CATEGORIES: readonly DocumentationCategory[] = [
  { key: "overview", labelEn: "The project", labelFr: "Le projet" },
  {
    key: "how_it_works",
    labelEn: "How it works",
    labelFr: "Comment ça marche",
  },
  { key: "planning", labelEn: "Planning", labelFr: "Planning & jalons" },
  {
    key: "other",
    labelEn: "Other information",
    labelFr: "Autres informations",
  },
] as const;

export function documentationCategoryLabel(
  key: DocumentationCategoryKey,
  locale: string,
): string {
  const category = DOCUMENTATION_CATEGORIES.find((entry) => entry.key === key);
  return locale === "fr"
    ? (category?.labelFr ?? key)
    : (category?.labelEn ?? key);
}
