import { z } from 'zod';

// specs/014-category-sections FR-001..FR-004. Supersedes 013's per-project,
// AI-invented categories: the taxonomy is now a product constant, identical
// in every project and every environment, and neither the AI nor a developer
// can add to it. 013's model let each new document mint or reuse categories,
// which converged on a handful of generic labels and made every client tab
// show the same thing.
//
// This array's ORDER is the client's tab order (FR-022), with `other` last.
//
// Deliberately small: adding a category later is a key plus two labels, while
// removing one that already carries sections is not. `decisions`, `usage` and
// `risks` were considered and dropped as premature — see spec.md FR-004.
//
// Two copies of this list exist by necessity, not by choice:
//   - apps/api/src/resources/resource-categories.ts (apps/api cannot import
//     this package — source-only, no build step; see AGENTS.md § Gotchas)
//   - the ResourceCategoryKey enum in apps/api/prisma/schema.prisma
// Change one, change all three.
export const RESOURCE_CATEGORY_KEYS = [
  'overview',
  'how_it_works',
  'planning',
  'other',
] as const;

export const ResourceCategoryKeySchema = z.enum(RESOURCE_CATEGORY_KEYS);
export type ResourceCategoryKey = z.infer<typeof ResourceCategoryKeySchema>;

export interface ResourceCategory {
  key: ResourceCategoryKey;
  labelEn: string;
  labelFr: string;
}

// Keys are identifier-safe rather than kebab-case so the same four strings
// serve as TypeScript values, wire values and Prisma enum members with no
// mapping layer (Prisma enum members can't contain hyphens). A key is never
// shown to a user — only the labels are — so readability costs nothing here.
export const RESOURCE_CATEGORIES: readonly ResourceCategory[] = [
  { key: 'overview', labelEn: 'The project', labelFr: 'Le projet' },
  { key: 'how_it_works', labelEn: 'How it works', labelFr: 'Comment ça marche' },
  { key: 'planning', labelEn: 'Roadmap', labelFr: 'Planning & jalons' },
  { key: 'other', labelEn: 'Other information', labelFr: 'Autres informations' },
] as const;

// Category labels live here rather than in the app's message catalogues:
// they belong to the same frozen list as the keys, and splitting them across
// two sources is how a rename silently half-lands.
export function resourceCategoryLabel(
  key: ResourceCategoryKey,
  locale: string,
): string {
  const category = RESOURCE_CATEGORIES.find((entry) => entry.key === key);
  if (!category) {
    return key;
  }
  return locale === 'fr' ? category.labelFr : category.labelEn;
}
