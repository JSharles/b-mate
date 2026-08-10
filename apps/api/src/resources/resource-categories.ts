// Hand-copy of `packages/schemas/src/resource-category.ts`, which is the
// source of truth. It is copied rather than imported because that package
// ships as TypeScript source with no build step and this app runs compiled
// CommonJS — Node cannot require raw `.ts` at runtime (AGENTS.md § Gotchas).
// The same conflict is already resolved the same way in
// `src/task-vulgarization/locale.ts`, which mirrors the web app's routing
// config. Adding a build step to the package is the correct long-term fix and
// is logged as debt; four constants don't justify it (plan.md § Complexity).
//
// A third copy exists as `enum ResourceCategoryKey` in prisma/schema.prisma.
// Change one, change all three.
//
// specs/014-category-sections FR-001..FR-004. Order is the client's tab
// order (FR-022), `other` last.
export const RESOURCE_CATEGORY_KEYS = [
  'overview',
  'how_it_works',
  'planning',
  'other',
] as const;

export type ResourceCategoryKey = (typeof RESOURCE_CATEGORY_KEYS)[number];

export interface ResourceCategoryDefinition {
  key: ResourceCategoryKey;
  labelEn: string;
  labelFr: string;
  // Fed to the analysis prompt so the model knows what belongs where. Not
  // shown to any user — the labels above are.
  holds: string;
}

export const RESOURCE_CATEGORIES: readonly ResourceCategoryDefinition[] = [
  {
    key: 'overview',
    labelEn: 'The project',
    labelFr: 'Le projet',
    holds:
      'What the project is for, who it serves, its functional scope, and what is being built.',
  },
  {
    key: 'how_it_works',
    labelEn: 'How it works',
    labelFr: 'Comment ça marche',
    holds:
      'Architecture, technical workings, data flows, and what diagrams or schemas show — all rewritten for a non-technical reader.',
  },
  {
    key: 'planning',
    labelEn: 'Roadmap',
    labelFr: 'Planning & jalons',
    holds: 'Dates, phases, milestones, sequencing, and dependencies.',
  },
  {
    key: 'other',
    labelEn: 'Other information',
    labelFr: 'Autres informations',
    holds:
      'Anything of substance that genuinely belongs to none of the categories above. This category exists so that no information is ever dropped.',
  },
];
