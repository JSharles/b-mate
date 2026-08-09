import { IsIn } from 'class-validator';
import { RESOURCE_CATEGORY_KEYS } from '../resource-categories';
// `import type` is required: with isolatedModules + emitDecoratorMetadata,
// a value-imported type referenced in a decorated signature is a TS1272.
import type { ResourceCategoryKey } from '../resource-categories';

// specs/014-category-sections contracts/resource-sections.md. Re-files a
// mis-categorized section. The category list is frozen (FR-001), so the only
// valid targets are its four keys — anything else is a 400 before the service
// is reached.
export class MoveResourceSectionDto {
  @IsIn(RESOURCE_CATEGORY_KEYS)
  categoryKey: ResourceCategoryKey;
}
