import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClientSection, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { SectionProposalService } from '../composition/section-proposal.service';
import {
  CreateClientSectionDto,
  ReorderClientSectionsDto,
  UpdateClientSectionDto,
} from '../dto/client-section.dto';

type SectionRow = ClientSection & {
  activeProposal: {
    id: string;
    sectionId: string;
    referenceDocumentId: string;
    status: string;
    version: number;
    changeSummary: string | null;
    createdAt: Date;
  } | null;
  proposals: { id: string }[];
};

const SECTION_INCLUDE = {
  activeProposal: true,
  // One approved proposal is enough to know the client has something to read;
  // taking more would be paid for on every list call.
  proposals: {
    where: { status: 'approved' as const },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.ClientSectionInclude;

@Injectable()
export class ClientSectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly proposals: SectionProposalService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);
    const rows = await this.prisma.clientSection.findMany({
      where: { projectId, archivedAt: null },
      include: SECTION_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { sections: rows.map((row) => this.toView(row as SectionRow)) };
  }

  async create(
    userId: string,
    projectId: string,
    input: CreateClientSectionDto,
    locale: string | null = null,
  ) {
    await this.access.requireContributor(userId, projectId);
    // US1.8: a section composed from nothing is not worth queueing, and the
    // contributor is better told what is missing than shown an empty proposal.
    await this.requireReferenceDocument(projectId);

    const last = await this.prisma.clientSection.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const created = await this.prisma.clientSection.create({
      data: {
        projectId,
        name: input.name.trim(),
        instructions: input.instructions.trim(),
        length: input.editorial.length,
        pedagogy: input.editorial.pedagogy,
        technicalFamiliarity: input.editorial.technicalFamiliarity,
        tone: input.editorial.tone,
        // Archived sections keep their slot, so a new section never lands on a
        // number an archived one still holds.
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdByUserId: userId,
      },
      include: SECTION_INCLUDE,
    });

    // Defining a section is asking for it. Making the contributor press
    // "Rédiger" afterwards asked them again for what they had just asked —
    // the same reason adding a document now writes the reference document.
    await this.compose(userId, projectId, created.id, locale);
    return this.toView(created);
  }

  async update(
    userId: string,
    projectId: string,
    sectionId: string,
    input: UpdateClientSectionDto,
    locale: string | null = null,
  ) {
    await this.access.requireContributor(userId, projectId);
    await this.requireSection(projectId, sectionId);

    const changesDefinition =
      input.name !== undefined ||
      input.instructions !== undefined ||
      input.editorial !== undefined;
    if (!changesDefinition) {
      throw new BadRequestException({ code: 'SECTION_UPDATE_EMPTY' });
    }

    // Revising what a section covers is the same act as defining it, so it is
    // written again. What does not recompose on its own is a section the
    // contributor did not touch — a rewritten reference document marks those
    // and waits (FR-020).
    const data: Prisma.ClientSectionUpdateManyMutationInput = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.instructions !== undefined
        ? { instructions: input.instructions.trim() }
        : {}),
      ...(input.editorial
        ? {
            length: input.editorial.length,
            pedagogy: input.editorial.pedagogy,
            technicalFamiliarity: input.editorial.technicalFamiliarity,
            tone: input.editorial.tone,
          }
        : {}),
      refreshNeeded: true,
      version: { increment: 1 },
    };

    // The version lives in the `where`, so a concurrent edit loses the race in
    // the database rather than in a read-then-write window.
    const { count } = await this.prisma.clientSection.updateMany({
      where: {
        id: sectionId,
        projectId,
        archivedAt: null,
        version: input.expectedVersion,
      },
      data,
    });
    if (count === 0) throw new ConflictException({ code: 'SECTION_STALE' });

    await this.compose(userId, projectId, sectionId, locale);

    const row = await this.prisma.clientSection.findUnique({
      where: { id: sectionId },
      include: SECTION_INCLUDE,
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND' });
    return this.toView(row);
  }

  // A composition already running has this definition behind it, and neither
  // that nor a project whose reference document went missing is a reason to
  // refuse the edit: the section is saved either way, and the screen offers the
  // write it did not get.
  private async compose(
    userId: string,
    projectId: string,
    sectionId: string,
    locale: string | null,
  ) {
    try {
      await this.proposals.compose(userId, projectId, sectionId, locale);
    } catch (error) {
      if (
        !(error instanceof ConflictException) &&
        !(error instanceof BadRequestException)
      ) {
        throw error;
      }
    }
  }

  async archive(userId: string, projectId: string, sectionId: string) {
    await this.access.requireContributor(userId, projectId);
    await this.requireSection(projectId, sectionId);

    // Archiving rather than deleting: the client stops reading it, and the
    // proposals that fed it stay explicable (research Decision 1).
    // Releasing `activeProposalId` here is what lets a composition in flight be
    // cancelled without the section holding a dead pointer; cancelling the
    // remote work itself belongs to the composition service (US4.4, T018).
    const { count } = await this.prisma.clientSection.updateMany({
      where: { id: sectionId, projectId, archivedAt: null },
      data: {
        archivedAt: new Date(),
        activeProposalId: null,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new NotFoundException({ code: 'NOT_FOUND' });
    return { archived: true as const };
  }

  async reorder(
    userId: string,
    projectId: string,
    input: ReorderClientSectionsDto,
  ) {
    await this.access.requireContributor(userId, projectId);

    const existing = await this.prisma.clientSection.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true },
    });

    const requested = input.orderedSectionIds;
    if (new Set(requested).size !== requested.length) {
      throw new BadRequestException({ code: 'SECTION_ORDER_DUPLICATE' });
    }
    // The order must name every live section exactly once. A partial order
    // would leave the rest at whatever number they happened to hold, which is
    // an order nobody chose.
    const known = new Set(existing.map(({ id }) => id));
    if (
      requested.length !== known.size ||
      requested.some((id) => !known.has(id))
    ) {
      throw new BadRequestException({ code: 'SECTION_ORDER_INCOMPLETE' });
    }

    await this.prisma.$transaction(
      requested.map((id, index) =>
        this.prisma.clientSection.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    // FR-020 does not apply here: reordering changes where the client reads a
    // section, never what it says, so it does not mark anything for refresh.
    return this.list(userId, projectId);
  }

  private async requireSection(projectId: string, sectionId: string) {
    const row = await this.prisma.clientSection.findFirst({
      where: { id: sectionId, projectId, archivedAt: null },
      select: { id: true },
    });
    // Principle V: a section in someone else's project is indistinguishable
    // from one that does not exist.
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND' });
    return row;
  }

  // A section is a view of the reference document, so there is nothing to
  // define one against before one exists (plan, Decision 4).
  private async requireReferenceDocument(projectId: string) {
    const written = await this.prisma.referenceDocument.count({
      where: { projectId, status: 'ready', outcome: 'written' },
    });
    if (written === 0) {
      throw new BadRequestException({ code: 'NO_REFERENCE_DOCUMENT' });
    }
  }

  private toView(row: SectionRow) {
    return {
      id: row.id,
      name: row.name,
      instructions: row.instructions,
      editorial: {
        length: row.length,
        pedagogy: row.pedagogy,
        technicalFamiliarity: row.technicalFamiliarity,
        tone: row.tone,
      },
      sortOrder: row.sortOrder,
      refreshNeeded: row.refreshNeeded,
      // Relevance corrections arrive in US2; until then no section has any.
      exclusionCount: 0,
      activeProposal: row.activeProposal
        ? {
            id: row.activeProposal.id,
            sectionId: row.activeProposal.sectionId,
            referenceDocumentId: row.activeProposal.referenceDocumentId,
            status: row.activeProposal.status,
            version: row.activeProposal.version,
            changeSummary: row.activeProposal.changeSummary,
            createdAt: row.activeProposal.createdAt.toISOString(),
          }
        : null,
      hasPublishedContent: row.proposals.length > 0,
      version: row.version,
    };
  }
}
