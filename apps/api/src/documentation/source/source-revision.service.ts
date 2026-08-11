import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  DocumentationCategoryKey,
  GenerationOperation,
  InformationItemKind,
  InformationItemState,
  Prisma,
  ProvenanceRole,
  RevisionChangeKind,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';

export interface CanonicalProvenance {
  documentObservationId: string;
  role: ProvenanceRole;
  exactContentHash: string;
}

export interface CurrentCanonicalItem {
  revisionItemId: string;
  informationItemId: string;
  previousRevisionItemId?: string | null;
  kind: InformationItemKind;
  state: InformationItemState;
  content: string;
  sortOrder: number;
  categories: DocumentationCategoryKey[];
  provenance: CanonicalProvenance[];
}

export interface ConsolidationObservation {
  id: string;
  kind: InformationItemKind;
  normalizedContent: string;
  exactContentHash: string;
  sourceLanguage?: string | null;
  categories: DocumentationCategoryKey[];
}

export interface ConsolidationDisposition {
  observationId: string;
  action: 'add' | 'support' | 'supersede' | 'conflict' | 'open' | 'exclude';
  targetInformationItemId?: string;
  match?: 'exact' | 'semantic';
  reason: string;
}

export interface PlannedCanonicalItem {
  informationItemId: string | null;
  previousRevisionItemId: string | null;
  kind: InformationItemKind;
  state: InformationItemState;
  content: string;
  sortOrder: number;
  categories: DocumentationCategoryKey[];
  provenance: CanonicalProvenance[];
}

export interface PlannedRevisionChange {
  informationItemId: string | null;
  kind: RevisionChangeKind;
  beforeRevisionItemId: string | null;
  causeObservationId: string;
  explanation: string;
}

export interface ConsolidationPlan {
  items: PlannedCanonicalItem[];
  changes: PlannedRevisionChange[];
  impactedCategories: DocumentationCategoryKey[];
}

export type SourceRevisionCommitResult =
  | { status: 'committed'; revisionId: string }
  | { status: 'already_committed'; revisionId: string }
  | { status: 'stale'; currentRevisionId: string | null };

export interface GuidedCorrectionCommitInput {
  projectId: string;
  projectSourceId: string;
  informationItemId: string;
  assertionId: string;
  correctedContent: string;
  expectedSourceRevisionId: string;
  userId: string;
}

export function buildConsolidationPlan(
  currentItems: readonly CurrentCanonicalItem[],
  observations: readonly ConsolidationObservation[],
  dispositions: readonly ConsolidationDisposition[],
): ConsolidationPlan {
  const observationsById = new Map(
    observations.map((observation) => [observation.id, observation]),
  );
  const dispositionCounts = new Map<string, number>();
  for (const disposition of dispositions) {
    if (!observationsById.has(disposition.observationId)) {
      throw new Error(
        `Consolidation references unknown observation ${disposition.observationId}.`,
      );
    }
    dispositionCounts.set(
      disposition.observationId,
      (dispositionCounts.get(disposition.observationId) ?? 0) + 1,
    );
  }
  for (const observation of observations) {
    if (dispositionCounts.get(observation.id) !== 1) {
      throw new Error(
        `Every input observation requires exactly one disposition (${observation.id}).`,
      );
    }
  }

  const items: PlannedCanonicalItem[] = currentItems.map((item) => ({
    informationItemId: item.informationItemId,
    previousRevisionItemId: item.revisionItemId,
    kind: item.kind,
    state: item.state,
    content: item.content,
    sortOrder: item.sortOrder,
    categories: uniqueCategories(item.categories),
    provenance: item.provenance.map((origin) => ({ ...origin })),
  }));
  const itemsByInformationId = new Map(
    items.map((item) => [item.informationItemId, item]),
  );
  const currentByInformationId = new Map(
    currentItems.map((item) => [item.informationItemId, item]),
  );
  const changes: PlannedRevisionChange[] = [];
  const impacts = new Set<DocumentationCategoryKey>();

  for (const disposition of dispositions) {
    const observation = observationsById.get(disposition.observationId)!;
    if (disposition.action === 'exclude') {
      continue;
    }
    if (disposition.action === 'add' || disposition.action === 'open') {
      items.push({
        informationItemId: null,
        previousRevisionItemId: null,
        kind: observation.kind,
        state: disposition.action === 'open' ? 'point_to_clarify' : 'confirmed',
        content: observation.normalizedContent,
        sortOrder: items.length,
        categories: uniqueCategories(observation.categories),
        provenance: [provenance(observation, 'supports')],
      });
      observation.categories.forEach((category) => impacts.add(category));
      changes.push({
        informationItemId: null,
        kind: disposition.action === 'open' ? 'marked_open' : 'added',
        beforeRevisionItemId: null,
        causeObservationId: observation.id,
        explanation: disposition.reason,
      });
      continue;
    }

    const targetId = disposition.targetInformationItemId;
    const target = targetId ? itemsByInformationId.get(targetId) : undefined;
    const previous = targetId
      ? currentByInformationId.get(targetId)
      : undefined;
    if (!target || !previous) {
      throw new Error(
        `${disposition.action} requires a current target information item.`,
      );
    }

    if (disposition.action === 'support') {
      if (
        disposition.match === 'exact' &&
        !target.provenance.some(
          (origin) => origin.exactContentHash === observation.exactContentHash,
        )
      ) {
        throw new Error(
          'An exact support disposition must match an exact hash.',
        );
      }
      if (
        !target.provenance.some(
          (origin) => origin.documentObservationId === observation.id,
        )
      ) {
        target.provenance.push(provenance(observation, 'supports'));
      }
      changes.push({
        informationItemId: target.informationItemId,
        kind: 'provenance_added',
        beforeRevisionItemId: previous.revisionItemId,
        causeObservationId: observation.id,
        explanation: disposition.reason,
      });
      continue;
    }

    if (disposition.action === 'supersede') {
      target.kind = observation.kind;
      target.state = 'confirmed';
      target.content = observation.normalizedContent;
      target.categories = uniqueCategories(observation.categories);
      target.provenance.push(provenance(observation, 'supersedes'));
      previous.categories.forEach((category) => impacts.add(category));
      observation.categories.forEach((category) => impacts.add(category));
      changes.push({
        informationItemId: target.informationItemId,
        kind: 'superseded',
        beforeRevisionItemId: previous.revisionItemId,
        causeObservationId: observation.id,
        explanation: disposition.reason,
      });
      continue;
    }

    target.state = 'point_to_clarify';
    target.provenance.push(provenance(observation, 'conflicts'));
    uniqueCategories([...target.categories, ...observation.categories]).forEach(
      (category) => impacts.add(category),
    );
    target.categories = uniqueCategories([
      ...target.categories,
      ...observation.categories,
    ]);
    changes.push({
      informationItemId: target.informationItemId,
      kind: 'marked_open',
      beforeRevisionItemId: previous.revisionItemId,
      causeObservationId: observation.id,
      explanation: disposition.reason,
    });
  }

  return {
    items,
    changes,
    impactedCategories: [...impacts].sort(),
  };
}

@Injectable()
export class SourceRevisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async readSource(
    userId: string,
    projectId: string,
    options: { revisionId?: string; cursor?: string },
  ) {
    await this.access.requireContributor(userId, projectId);
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
    });
    if (!source) {
      this.hideNotFound();
    }
    const revisionId = options.revisionId ?? source.currentRevisionId;
    if (!revisionId) {
      this.hideNotFound();
    }
    const revision = await this.prisma.sourceRevision.findFirst({
      where: { id: revisionId, projectSourceId: source.id },
      include: { impacts: true },
    });
    if (!revision) {
      this.hideNotFound();
    }
    const pageSize = 50;
    const where = { sourceRevisionId: revision.id };
    const [total, rows] = await Promise.all([
      this.prisma.sourceRevisionItem.count({ where }),
      this.prisma.sourceRevisionItem.findMany({
        where,
        include: {
          categories: true,
          provenanceLinks: { select: { id: true } },
          informationItem: {
            include: { clarificationItems: true },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: pageSize + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    return {
      revision: revisionSummary(revision),
      items: page.map((item) => ({
        id: item.informationItemId,
        kind: item.kind,
        state: item.state,
        content: item.content,
        categories: item.categories.map((entry) => entry.categoryKey),
        provenanceCount: item.provenanceLinks.length,
        clarificationIds: item.informationItem.clarificationItems.map(
          (entry) => entry.clarificationId,
        ),
      })),
      total,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async listRevisions(userId: string, projectId: string, cursor?: string) {
    await this.access.requireContributor(userId, projectId);
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
    });
    if (!source) {
      return { items: [], total: 0, nextCursor: null };
    }
    const pageSize = 50;
    const where = { projectSourceId: source.id };
    const [total, rows] = await Promise.all([
      this.prisma.sourceRevision.count({ where }),
      this.prisma.sourceRevision.findMany({
        where,
        include: { impacts: true },
        orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    return {
      items: page.map(revisionSummary),
      total,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async readProvenance(
    userId: string,
    projectId: string,
    informationItemId: string,
    requestedRevisionId?: string,
  ) {
    await this.access.requireContributor(userId, projectId);
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
    });
    if (!source) {
      this.hideNotFound();
    }
    const revisionId = requestedRevisionId ?? source.currentRevisionId;
    if (!revisionId) {
      this.hideNotFound();
    }
    const item = await this.prisma.sourceRevisionItem.findFirst({
      where: {
        informationItemId,
        sourceRevision: { id: revisionId, projectSourceId: source.id },
      },
      include: {
        sourceRevision: true,
        provenanceLinks: {
          include: {
            documentObservation: { include: { sourceDocument: true } },
            contributorAssertion: {
              include: { authorUser: true },
            },
          },
        },
      },
    });
    if (!item) {
      this.hideNotFound();
    }
    const changes = await this.prisma.sourceRevisionChange.findMany({
      where: {
        informationItemId,
        sourceRevision: { projectSourceId: source.id },
      },
      include: { sourceRevision: true },
      orderBy: { sourceRevision: { sequence: 'asc' } },
    });
    return {
      itemId: informationItemId,
      revisionId: item.sourceRevisionId,
      origins: item.provenanceLinks.map((link) => {
        if (link.documentObservation?.sourceDocument) {
          const observation = link.documentObservation;
          return {
            kind: 'document' as const,
            documentId: observation.sourceDocumentId,
            label: observation.sourceDocument.title,
            locator: observation.locator,
            excerpt: observation.originalExcerpt,
            role: link.role,
          };
        }
        if (link.contributorAssertion) {
          const assertion = link.contributorAssertion;
          return {
            kind: 'contributor' as const,
            label:
              `${assertion.authorUser.firstName} ${assertion.authorUser.lastName}`.trim(),
            locator: null,
            excerpt: assertion.content,
            role: link.role,
          };
        }
        throw new Error('Invalid provenance origin.');
      }),
      history: changes.map((change) => ({
        revisionId: change.sourceRevisionId,
        revisionSequence: change.sourceRevision.sequence,
        change: change.kind,
        createdAt: change.sourceRevision.createdAt.toISOString(),
      })),
    };
  }

  commitFromConsolidation(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    dispositions: ConsolidationDisposition[],
  ): Promise<SourceRevisionCommitResult> {
    return this.commit(tx, operation, dispositions);
  }

  async commitClarificationAnswers(
    tx: Prisma.TransactionClient,
    input: {
      projectId: string;
      projectSourceId: string;
      expectedSourceRevisionId: string;
      userId: string;
      answers: Array<{
        clarificationId: string;
        assertionId: string;
        informationItemIds: string[];
        content: string;
      }>;
    },
  ): Promise<SourceRevisionCommitResult> {
    const source = await this.lockSource(tx, input.projectSourceId);
    if (source.currentRevisionId !== input.expectedSourceRevisionId) {
      return { status: 'stale', currentRevisionId: source.currentRevisionId };
    }
    const items = await this.currentSnapshotRows(
      tx,
      input.expectedSourceRevisionId,
    );
    const answerByItem = new Map<string, (typeof input.answers)[number]>();
    for (const answer of input.answers) {
      for (const informationItemId of answer.informationItemIds) {
        if (answerByItem.has(informationItemId)) {
          throw new Error('Two answers cannot rewrite the same item.');
        }
        answerByItem.set(informationItemId, answer);
      }
    }
    if (
      [...answerByItem.keys()].some(
        (id) => !items.some((item) => item.informationItemId === id),
      )
    ) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }
    const revision = await tx.sourceRevision.create({
      data: {
        projectSourceId: source.id,
        sequence: source.nextSequence,
        parentRevisionId: source.currentRevisionId,
        trigger: 'clarification_answered',
        triggerClarificationId:
          input.answers.length === 1 ? input.answers[0].clarificationId : null,
        createdByUserId: input.userId,
        summary: `${input.answers.length} clarification answer(s) applied.`,
      },
    });
    const impacts = new Set<DocumentationCategoryKey>();
    for (const item of items) {
      const answer = answerByItem.get(item.informationItemId);
      const created = await tx.sourceRevisionItem.create({
        data: {
          sourceRevisionId: revision.id,
          informationItemId: item.informationItemId,
          previousRevisionItemId: item.id,
          kind: item.kind,
          state: answer ? 'confirmed' : item.state,
          content: answer?.content ?? item.content,
          sortOrder: item.sortOrder,
          categories: {
            create: item.categories.map(({ categoryKey }) => ({ categoryKey })),
          },
          provenanceLinks: {
            create: [
              ...item.provenanceLinks.map((link) => ({
                documentObservationId: link.documentObservationId,
                contributorAssertionId: link.contributorAssertionId,
                role: link.role,
              })),
              ...(answer
                ? [
                    {
                      contributorAssertionId: answer.assertionId,
                      role: 'confirms' as const,
                    },
                  ]
                : []),
            ],
          },
        },
      });
      if (answer) {
        item.categories.forEach(({ categoryKey }) => impacts.add(categoryKey));
        await tx.sourceRevisionChange.create({
          data: {
            sourceRevisionId: revision.id,
            informationItemId: item.informationItemId,
            kind: 'resolved',
            beforeRevisionItemId: item.id,
            afterRevisionItemId: created.id,
            causeAssertionId: answer.assertionId,
            explanation: 'Contributor answered a material clarification.',
          },
        });
      }
    }
    await this.writeImpactsAndTargets(
      tx,
      input.projectId,
      revision.id,
      [...impacts],
      'Contributor resolved a clarification.',
    );
    for (const answer of input.answers) {
      await tx.contributorAssertion.update({
        where: { id: answer.assertionId },
        data: { appliedInRevisionId: revision.id },
      });
    }
    await this.advanceSource(tx, source, revision.id);
    return { status: 'committed', revisionId: revision.id };
  }

  async commitGuidedCorrection(
    tx: Prisma.TransactionClient,
    input: GuidedCorrectionCommitInput,
  ): Promise<SourceRevisionCommitResult> {
    const source = await this.lockSource(tx, input.projectSourceId);
    if (source.currentRevisionId !== input.expectedSourceRevisionId) {
      return { status: 'stale', currentRevisionId: source.currentRevisionId };
    }
    const items = await this.currentSnapshotRows(
      tx,
      input.expectedSourceRevisionId,
    );
    const target = items.find(
      (item) => item.informationItemId === input.informationItemId,
    );
    if (!target) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }
    const revision = await tx.sourceRevision.create({
      data: {
        projectSourceId: source.id,
        sequence: source.nextSequence,
        parentRevisionId: source.currentRevisionId,
        trigger: 'guided_correction',
        triggerAssertionId: input.assertionId,
        createdByUserId: input.userId,
        summary: 'Guided factual correction.',
      },
    });
    const created = await this.copySnapshot(tx, revision.id, items, {
      informationItemId: input.informationItemId,
      content: input.correctedContent,
      assertionId: input.assertionId,
    });
    const targetCategories = target.categories.map(
      ({ categoryKey }) => categoryKey,
    );
    await this.writeImpactsAndTargets(
      tx,
      input.projectId,
      revision.id,
      targetCategories,
      'Contributor corrected a canonical fact.',
    );
    await tx.sourceRevisionChange.create({
      data: {
        sourceRevisionId: revision.id,
        informationItemId: input.informationItemId,
        kind: 'updated',
        beforeRevisionItemId: target.id,
        afterRevisionItemId: created.get(input.informationItemId),
        causeAssertionId: input.assertionId,
        explanation: 'Contributor supplied an attributable factual correction.',
      },
    });
    await tx.contributorAssertion.update({
      where: { id: input.assertionId },
      data: { appliedInRevisionId: revision.id },
    });
    await this.advanceSource(tx, source, revision.id);
    return { status: 'committed', revisionId: revision.id };
  }

  private async commit(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    dispositions: ConsolidationDisposition[],
  ): Promise<SourceRevisionCommitResult> {
    if (!operation.sourceDocumentId) {
      throw new Error('Source consolidation requires a document.');
    }
    const document = await tx.sourceDocument.findFirst({
      where: { id: operation.sourceDocumentId, projectId: operation.projectId },
    });
    if (!document) {
      throw new Error('Source consolidation document is unavailable.');
    }
    if (document.incorporatedInRevisionId) {
      return {
        status: 'already_committed',
        revisionId: document.incorporatedInRevisionId,
      };
    }

    const source = await tx.projectSource.upsert({
      where: { projectId: operation.projectId },
      update: {},
      create: { projectId: operation.projectId },
    });
    await tx.$queryRaw`
      SELECT "id" FROM "project_sources"
      WHERE "id" = ${source.id}::uuid
      FOR UPDATE
    `;
    const lockedSource = await tx.projectSource.findUniqueOrThrow({
      where: { id: source.id },
    });
    if (lockedSource.currentRevisionId !== operation.baseSourceRevisionId) {
      return {
        status: 'stale',
        currentRevisionId: lockedSource.currentRevisionId,
      };
    }

    const observations = await tx.documentObservation.findMany({
      where: { sourceDocumentId: document.id },
      include: { categories: true },
      orderBy: { sequence: 'asc' },
    });
    const currentRows = lockedSource.currentRevisionId
      ? await tx.sourceRevisionItem.findMany({
          where: { sourceRevisionId: lockedSource.currentRevisionId },
          include: {
            categories: true,
            provenanceLinks: {
              include: { documentObservation: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        })
      : [];
    const currentItems: CurrentCanonicalItem[] = currentRows.map((item) => ({
      revisionItemId: item.id,
      informationItemId: item.informationItemId,
      kind: item.kind,
      state: item.state,
      content: item.content,
      sortOrder: item.sortOrder,
      categories: item.categories.map((category) => category.categoryKey),
      provenance: item.provenanceLinks.flatMap((link) =>
        link.documentObservationId && link.documentObservation
          ? [
              {
                documentObservationId: link.documentObservationId,
                role: link.role,
                exactContentHash: link.documentObservation.exactContentHash,
              },
            ]
          : [],
      ),
    }));
    const plan = buildConsolidationPlan(
      currentItems,
      observations.map((observation) => ({
        id: observation.id,
        kind: observation.kind,
        normalizedContent: observation.normalizedContent,
        exactContentHash: observation.exactContentHash,
        sourceLanguage: observation.sourceLanguage,
        categories: observation.categories.map(
          (category) => category.categoryKey,
        ),
      })),
      dispositions,
    );

    const revision = await tx.sourceRevision.create({
      data: {
        projectSourceId: lockedSource.id,
        sequence: lockedSource.nextSequence,
        parentRevisionId: lockedSource.currentRevisionId,
        trigger: 'document_added',
        triggerDocumentId: document.id,
        createdByUserId: document.addedByUserId,
        summary: `Document incorporated: ${document.title}`,
      },
    });
    const createdItems = new Map<string, string>();
    for (const item of plan.items) {
      const informationItemId =
        item.informationItemId ??
        (
          await tx.informationItem.create({
            data: {
              projectSourceId: lockedSource.id,
              createdInRevisionId: revision.id,
            },
          })
        ).id;
      const revisionItem = await tx.sourceRevisionItem.create({
        data: {
          sourceRevisionId: revision.id,
          informationItemId,
          previousRevisionItemId: item.previousRevisionItemId,
          kind: item.kind,
          state: item.state,
          content: item.content,
          sortOrder: item.sortOrder,
          categories: {
            create: item.categories.map((categoryKey) => ({ categoryKey })),
          },
          provenanceLinks: {
            create: item.provenance.map((origin) => ({
              documentObservationId: origin.documentObservationId,
              role: origin.role,
            })),
          },
        },
      });
      createdItems.set(informationItemId, revisionItem.id);
      if (!item.informationItemId) {
        const change = plan.changes.find(
          (candidate) =>
            candidate.informationItemId === null &&
            item.provenance.some(
              (origin) =>
                origin.documentObservationId === candidate.causeObservationId,
            ),
        );
        if (change) {
          change.informationItemId = informationItemId;
        }
      }
    }
    if (plan.impactedCategories.length > 0) {
      await tx.sourceRevisionImpact.createMany({
        data: plan.impactedCategories.map((categoryKey) => ({
          sourceRevisionId: revision.id,
          categoryKey,
          reason: 'Canonical source changed after document incorporation.',
        })),
      });
    }
    for (const change of plan.changes) {
      if (!change.informationItemId) {
        throw new Error('Revision change could not be linked to an item.');
      }
      await tx.sourceRevisionChange.create({
        data: {
          sourceRevisionId: revision.id,
          informationItemId: change.informationItemId,
          kind: change.kind,
          beforeRevisionItemId: change.beforeRevisionItemId,
          afterRevisionItemId: createdItems.get(change.informationItemId),
          causeDocumentId: document.id,
          explanation: change.explanation,
        },
      });
    }
    for (const categoryKey of plan.impactedCategories) {
      await tx.categoryProjectionState.upsert({
        where: {
          projectId_categoryKey: {
            projectId: operation.projectId,
            categoryKey,
          },
        },
        update: {
          targetSourceRevisionId: revision.id,
          version: { increment: 1 },
        },
        create: {
          projectId: operation.projectId,
          categoryKey,
          targetSourceRevisionId: revision.id,
        },
      });
    }
    const advanced = await tx.projectSource.updateMany({
      where: {
        id: lockedSource.id,
        currentRevisionId: lockedSource.currentRevisionId,
        nextSequence: lockedSource.nextSequence,
      },
      data: {
        currentRevisionId: revision.id,
        nextSequence: { increment: 1 },
        lockVersion: { increment: 1 },
      },
    });
    if (advanced.count !== 1) {
      throw new Error('Canonical source head changed during commit.');
    }
    await tx.sourceDocument.update({
      where: { id: document.id },
      data: {
        status: 'incorporated',
        incorporatedInRevisionId: revision.id,
        failureCode: null,
      },
    });
    return { status: 'committed', revisionId: revision.id };
  }

  private async lockSource(
    tx: Prisma.TransactionClient,
    projectSourceId: string,
  ) {
    await tx.$queryRaw`
      SELECT "id" FROM "project_sources"
      WHERE "id" = ${projectSourceId}::uuid
      FOR UPDATE
    `;
    return tx.projectSource.findUniqueOrThrow({
      where: { id: projectSourceId },
    });
  }

  private currentSnapshotRows(
    tx: Prisma.TransactionClient,
    revisionId: string,
  ) {
    return tx.sourceRevisionItem.findMany({
      where: { sourceRevisionId: revisionId },
      include: { categories: true, provenanceLinks: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async copySnapshot(
    tx: Prisma.TransactionClient,
    revisionId: string,
    items: Awaited<ReturnType<SourceRevisionService['currentSnapshotRows']>>,
    correction?: {
      informationItemId: string;
      content: string;
      assertionId: string;
    },
    translations?: ReadonlyMap<string, string>,
  ): Promise<Map<string, string>> {
    const created = new Map<string, string>();
    for (const item of items) {
      const isCorrection =
        correction?.informationItemId === item.informationItemId;
      const revisionItem = await tx.sourceRevisionItem.create({
        data: {
          sourceRevisionId: revisionId,
          informationItemId: item.informationItemId,
          previousRevisionItemId: item.id,
          kind: item.kind,
          state: item.state,
          content:
            translations?.get(item.informationItemId) ??
            (isCorrection ? correction.content : item.content),
          sortOrder: item.sortOrder,
          categories: {
            create: item.categories.map(({ categoryKey }) => ({ categoryKey })),
          },
          provenanceLinks: {
            create: [
              ...item.provenanceLinks.map((link) => ({
                documentObservationId: link.documentObservationId,
                contributorAssertionId: link.contributorAssertionId,
                role: link.role,
              })),
              ...(isCorrection
                ? [
                    {
                      contributorAssertionId: correction.assertionId,
                      role: 'confirms' as const,
                    },
                  ]
                : []),
            ],
          },
        },
      });
      created.set(item.informationItemId, revisionItem.id);
    }
    return created;
  }

  private async writeImpactsAndTargets(
    tx: Prisma.TransactionClient,
    projectId: string,
    revisionId: string,
    categories: DocumentationCategoryKey[],
    reason: string,
  ): Promise<void> {
    if (categories.length > 0) {
      await tx.sourceRevisionImpact.createMany({
        data: categories.map((categoryKey) => ({
          sourceRevisionId: revisionId,
          categoryKey,
          reason,
        })),
      });
    }
    for (const categoryKey of categories) {
      await tx.categoryProjectionState.upsert({
        where: { projectId_categoryKey: { projectId, categoryKey } },
        update: {
          targetSourceRevisionId: revisionId,
          version: { increment: 1 },
        },
        create: { projectId, categoryKey, targetSourceRevisionId: revisionId },
      });
    }
  }

  private async advanceSource(
    tx: Prisma.TransactionClient,
    source: {
      id: string;
      currentRevisionId: string | null;
      nextSequence: number;
    },
    revisionId: string,
  ): Promise<void> {
    const advanced = await tx.projectSource.updateMany({
      where: {
        id: source.id,
        currentRevisionId: source.currentRevisionId,
        nextSequence: source.nextSequence,
      },
      data: {
        currentRevisionId: revisionId,
        nextSequence: { increment: 1 },
        lockVersion: { increment: 1 },
      },
    });
    if (advanced.count !== 1) {
      throw new Error('Canonical source head changed during commit.');
    }
  }

  private hideNotFound(): never {
    throw new NotFoundException({ code: 'NOT_FOUND' });
  }
}

function provenance(
  observation: ConsolidationObservation,
  role: ProvenanceRole,
): CanonicalProvenance {
  return {
    documentObservationId: observation.id,
    role,
    exactContentHash: observation.exactContentHash,
  };
}

function uniqueCategories(
  categories: readonly DocumentationCategoryKey[],
): DocumentationCategoryKey[] {
  return [...new Set(categories)].sort();
}

function revisionSummary(revision: {
  id: string;
  sequence: number;
  trigger: string;
  summary: string;
  createdAt: Date;
  impacts: Array<{ categoryKey: DocumentationCategoryKey }>;
}) {
  return {
    id: revision.id,
    sequence: revision.sequence,
    trigger: revision.trigger,
    summary: revision.summary,
    impactedCategories: revision.impacts.map((impact) => impact.categoryKey),
    createdAt: revision.createdAt.toISOString(),
  };
}
