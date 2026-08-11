import { DocumentationCategoryKey } from '@prisma/client';
import {
  DOCUMENTATION_CATEGORIES,
  DOCUMENTATION_CATEGORY_KEYS,
  documentationCategoryLabel,
} from './documentation-categories';

describe('documentation categories', () => {
  it('matches Prisma values and preserves the product order', () => {
    expect(DOCUMENTATION_CATEGORY_KEYS).toEqual([
      DocumentationCategoryKey.overview,
      DocumentationCategoryKey.how_it_works,
      DocumentationCategoryKey.planning,
      DocumentationCategoryKey.other,
    ]);
    expect(DOCUMENTATION_CATEGORIES.map(({ key }) => key)).toEqual(
      DOCUMENTATION_CATEGORY_KEYS,
    );
  });

  it('returns localized labels from the fixed taxonomy', () => {
    expect(documentationCategoryLabel('overview', 'fr')).toBe('Le projet');
    expect(documentationCategoryLabel('overview', 'en')).toBe('The project');
    expect(documentationCategoryLabel('missing' as never, 'fr')).toBe(
      'missing',
    );
    expect(documentationCategoryLabel('missing' as never, 'en')).toBe(
      'missing',
    );
  });
});
