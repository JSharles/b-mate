jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));

import mammoth from 'mammoth';
import { Test } from '@nestjs/testing';
import { ImageNormalizer } from './image-normalizer';
import { DocumentInputNormalizerService } from './document-input-normalizer.service';

const mockedMammoth = jest.mocked(mammoth);

describe('DocumentInputNormalizerService', () => {
  const imageNormalizer = {
    normalize: jest.fn(),
  } as unknown as jest.Mocked<ImageNormalizer>;
  let service: DocumentInputNormalizerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DocumentInputNormalizerService(imageNormalizer, 24);
  });

  it('can be created by Nest without an optional chunk-size provider', async () => {
    const module = await Test.createTestingModule({
      providers: [ImageNormalizer, DocumentInputNormalizerService],
    }).compile();

    expect(module.get(DocumentInputNormalizerService)).toBeInstanceOf(
      DocumentInputNormalizerService,
    );
  });

  it('preserves a PDF as a provider-neutral native part with a stable hash', async () => {
    const bytes = Buffer.from('%PDF-1.7\ncanonical');

    const first = await service.normalizeUpload({
      bytes,
      fileName: 'architecture.pdf',
      mimeType: 'application/pdf',
    });
    const second = await service.normalizeUpload({
      bytes: Buffer.from(bytes),
      fileName: 'architecture.pdf',
      mimeType: 'application/pdf',
    });

    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.parts).toEqual([
      {
        kind: 'pdf',
        data: bytes,
        mimeType: 'application/pdf',
      },
    ]);
    expect(first.chunks).toEqual([]);
  });

  it('extracts DOCX text and chunks it deterministically without losing content', async () => {
    mockedMammoth.extractRawText.mockResolvedValue({
      value:
        'Objectifs\n\nUne première phrase utile. Une seconde phrase utile.\n\nContraintes\n\nLe délai est ferme.',
      messages: [],
    });

    const input = {
      bytes: Buffer.from('docx fixture'),
      fileName: 'brief.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const,
    };
    const first = await service.normalizeUpload(input);
    const second = await service.normalizeUpload(input);

    expect(mockedMammoth.extractRawText).toHaveBeenCalledWith({
      buffer: input.bytes,
    });
    expect(first.chunks.length).toBeGreaterThan(1);
    expect(first.chunks).toEqual(second.chunks);
    expect(first.chunks.every((chunk) => chunk.hash.length === 64)).toBe(true);
    expect(first.chunks.map((chunk) => chunk.text).join('')).toBe(
      first.normalizedText,
    );
    expect(first.parts).toEqual(
      first.chunks.map((chunk) => ({ kind: 'text', text: chunk.text })),
    );
  });

  it('normalizes images before creating the provider-neutral image part', async () => {
    const normalized = Buffer.from('normalized image');
    imageNormalizer.normalize.mockResolvedValue({
      buffer: normalized,
      mimeType: 'image/jpeg',
    });

    const result = await service.normalizeUpload({
      bytes: Buffer.from('large png'),
      fileName: 'schema.png',
      mimeType: 'image/png',
    });

    expect(imageNormalizer.normalize).toHaveBeenCalledWith(
      Buffer.from('large png'),
      'image/png',
    );
    expect(result.parts).toEqual([
      { kind: 'image', data: normalized, mimeType: 'image/jpeg' },
    ]);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serializes an immutable Notion snapshot in stable block order', () => {
    const result = service.normalizeNotion({
      pageId: 'page-1',
      title: 'Cadrage',
      blocks: [
        { id: 'block-b', position: 1, text: 'Le budget est validé.' },
        { id: 'block-a', position: 0, text: 'Le lancement est en avril.' },
      ],
    });

    expect(result.normalizedText).toBe(
      'Le lancement est en avril.\n\nLe budget est validé.',
    );
    expect(result.sourceSegments).toEqual([
      {
        text: 'Le lancement est en avril.',
        locator: { type: 'notion_block', blockId: 'block-a', position: 0 },
      },
      {
        text: 'Le budget est validé.',
        locator: { type: 'notion_block', blockId: 'block-b', position: 1 },
      },
    ]);
    expect(result.snapshot).toEqual({
      pageId: 'page-1',
      title: 'Cadrage',
      blocks: [
        { id: 'block-a', position: 0, text: 'Le lancement est en avril.' },
        { id: 'block-b', position: 1, text: 'Le budget est validé.' },
      ],
    });
  });

  it('hashes different original inputs differently even when their text normalizes equally', async () => {
    const first = await service.normalizeUpload({
      bytes: Buffer.from('same text\n'),
      fileName: 'a.md',
      mimeType: 'text/markdown',
    });
    const second = await service.normalizeUpload({
      bytes: Buffer.from('same text\r\n'),
      fileName: 'a.md',
      mimeType: 'text/markdown',
    });

    expect(first.normalizedText).toBe(second.normalizedText);
    expect(first.contentHash).not.toBe(second.contentHash);
  });
});
