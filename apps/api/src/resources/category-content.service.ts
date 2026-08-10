import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Locale } from '../task-vulgarization/locale';
import { ReferenceAnalysisClient } from './reference-analysis.client';
import {
  RESOURCE_CATEGORIES,
  ResourceCategoryKey,
} from './resource-categories';

export interface CategoryContentResponse {
  categoryKey: ResourceCategoryKey;
  content: string;
}

@Injectable()
export class CategoryContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referenceAnalysisClient: ReferenceAnalysisClient,
  ) {}

  // What a client reads. Ordered by the frozen category list so tabs never
  // reshuffle, and a category with no content is simply **absent** — that
  // absence is the only mechanism producing "no empty tab" (FR-012).
  async findForProject(
    userId: string,
    projectId: string,
    locale: Locale,
  ): Promise<CategoryContentResponse[]> {
    await this.assertIsMember(userId, projectId);

    const contents = await this.prisma.categoryContent.findMany({
      where: { projectId },
    });
    const byKey = new Map(contents.map((entry) => [entry.categoryKey, entry]));

    return RESOURCE_CATEGORIES.flatMap((category) => {
      const entry = byKey.get(category.key);
      if (!entry) {
        return [];
      }
      return [
        {
          categoryKey: category.key,
          content: locale === 'fr' ? entry.contentFr : entry.contentEn,
        },
      ];
    });
  }

  // Called when a contributor accepts a draft. Derivation is asynchronous like
  // everything else here; until it lands, the client keeps reading the
  // previous version — which is the whole point of deriving into a separate
  // row rather than rendering the reference directly.
  async deriveForCategory(
    projectId: string,
    categoryKey: ResourceCategoryKey,
  ): Promise<string | null> {
    const reference = await this.prisma.categoryReference.findUnique({
      where: { projectId_categoryKey: { projectId, categoryKey } },
    });
    if (!reference) {
      return null;
    }

    const batchId = await this.referenceAnalysisClient.submitDerivation(
      categoryKey,
      reference.content,
    );

    await this.prisma.categoryReference.update({
      where: { id: reference.id },
      data: { derivationBatchId: batchId },
    });

    return batchId;
  }

  // Both roles read this — it is the one surface a client has.
  private async assertIsMember(
    userId: string,
    projectId: string,
  ): Promise<void> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new NotFoundException('Project not found');
    }
  }
}
