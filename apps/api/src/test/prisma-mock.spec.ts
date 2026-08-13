import { createPrismaMock, PrismaMock } from './prisma-mock';

describe('createPrismaMock', () => {
  it('provides every documentary and generation delegate', () => {
    const prisma = createPrismaMock();

    expect(typeof prisma.referenceDocument.findFirst).toBe('function');
    expect(typeof prisma.sourceDocument.create).toBe('function');
    expect(typeof prisma.note.create).toBe('function');
    expect(typeof prisma.sectionProposal.updateMany).toBe('function');
    expect(typeof prisma.clientSection.findMany).toBe('function');
    expect(typeof prisma.clientSection.upsert).toBe('function');
    expect(typeof prisma.sectionProposal.findMany).toBe('function');
    expect(typeof prisma.clientSection.findMany).toBe('function');
    expect(typeof prisma.clientSectionContent.upsert).toBe('function');
    expect(typeof prisma.clientContentReleaseEntry.createMany).toBe('function');
    expect(typeof prisma.generationOperation.findFirst).toBe('function');
    expect(typeof prisma.generationAttempt.updateMany).toBe('function');
  });

  it('runs interactive transaction callbacks against the same mock', async () => {
    const prisma = createPrismaMock();
    const callback = jest.fn((tx: PrismaMock) => tx === prisma);

    const result: unknown = await prisma.$transaction(callback);

    expect(result).toBe(true);
    expect(callback).toHaveBeenCalledWith(prisma);
  });

  it('resolves array transactions in order', async () => {
    const prisma = createPrismaMock();

    await expect(
      prisma.$transaction([
        Promise.resolve('first'),
        Promise.resolve('second'),
      ]),
    ).resolves.toEqual(['first', 'second']);
  });
});
