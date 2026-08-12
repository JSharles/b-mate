import { BadRequestException, ConflictException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClientSectionService } from '../sections/client-section.service';
import { SectionsController } from './sections.controller';

const projectId = '00000000-0000-4000-8000-000000000001';
const sectionId = '00000000-0000-4000-8000-000000000002';
const otherSectionId = '00000000-0000-4000-8000-000000000003';
const user = { id: 'user-1' } as User;

const editorial = {
  length: 'balanced' as const,
  pedagogy: 'guided' as const,
  technicalFamiliarity: 'novice' as const,
  tone: 'reassuring' as const,
};

describe('SectionsController', () => {
  function setup() {
    const sections = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      reorder: jest.fn(),
    };
    return {
      sections,
      controller: new SectionsController(
        sections as unknown as ClientSectionService,
      ),
    };
  }

  it('lists a project sections for the caller', async () => {
    const { sections, controller } = setup();
    sections.list.mockResolvedValue({ sections: [] });

    await expect(controller.list(user, projectId)).resolves.toEqual({
      sections: [],
    });
    expect(sections.list).toHaveBeenCalledWith('user-1', projectId);
  });

  it('passes a creation through untouched', async () => {
    const { sections, controller } = setup();
    const body = {
      name: 'Planning',
      instructions: 'Les jalons.',
      editorial,
    };
    sections.create.mockResolvedValue({ id: sectionId });

    await controller.create(user, projectId, body);

    expect(sections.create).toHaveBeenCalledWith('user-1', projectId, body);
  });

  it('surfaces the refusal to compose a section from nothing', async () => {
    const { sections, controller } = setup();
    sections.create.mockRejectedValue(
      new BadRequestException({ code: 'NO_CANONICAL_CONTENT' }),
    );

    await expect(
      controller.create(user, projectId, {
        name: 'Planning',
        instructions: 'Les jalons.',
        editorial,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'NO_CANONICAL_CONTENT' },
    });
  });

  it('surfaces a stale version as a conflict rather than an overwrite', async () => {
    const { sections, controller } = setup();
    sections.update.mockRejectedValue(
      new ConflictException({ code: 'SECTION_STALE' }),
    );

    await expect(
      controller.update(user, projectId, sectionId, {
        name: 'Planning',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'SECTION_STALE' },
    });
  });

  it('delegates an update with its section id', async () => {
    const { sections, controller } = setup();
    const body = { name: 'Planning', expectedVersion: 2 };
    sections.update.mockResolvedValue({ id: sectionId });

    await controller.update(user, projectId, sectionId, body);

    expect(sections.update).toHaveBeenCalledWith(
      'user-1',
      projectId,
      sectionId,
      body,
    );
  });

  it('archives rather than deletes', async () => {
    const { sections, controller } = setup();
    sections.archive.mockResolvedValue({ archived: true });

    await expect(
      controller.archive(user, projectId, sectionId),
    ).resolves.toEqual({ archived: true });
    expect(sections.archive).toHaveBeenCalledWith(
      'user-1',
      projectId,
      sectionId,
    );
  });

  it('delegates the full ordered set', async () => {
    const { sections, controller } = setup();
    const body = { orderedSectionIds: [otherSectionId, sectionId] };
    sections.reorder.mockResolvedValue({ sections: [] });

    await controller.reorder(user, projectId, body);

    expect(sections.reorder).toHaveBeenCalledWith('user-1', projectId, body);
  });
});
