import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import mammoth from 'mammoth';
import { ImageNormalizer, NormalizableImageMimeType } from './image-normalizer';
import type { GenerationRequestPart } from '../../generation/adapters/generation-provider';

export const DEFAULT_DOCUMENT_CHUNK_SIZE = 12_000;
export const DOCUMENT_CHUNK_SIZE = Symbol('DOCUMENT_CHUNK_SIZE');

export interface DocumentChunk {
  index: number;
  text: string;
  hash: string;
}

export interface NotionBlockSnapshot {
  id: string;
  position: number;
  text: string;
}

export interface NotionPageSnapshot {
  pageId: string;
  title: string;
  blocks: NotionBlockSnapshot[];
}

export type NormalizedSourceSegment = {
  text: string;
  locator:
    | { type: 'docx_heading'; heading: string; paragraph: number }
    | { type: 'notion_block'; blockId: string; position: number };
};

export interface NormalizedDocumentInput {
  contentHash: string;
  normalizedText: string | null;
  chunks: DocumentChunk[];
  parts: GenerationRequestPart[];
  sourceSegments: NormalizedSourceSegment[];
  snapshot?: NotionPageSnapshot;
}

export interface UploadDocumentInput {
  bytes: Buffer;
  fileName: string;
  mimeType:
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    | 'image/png'
    | 'image/jpeg'
    | 'text/plain'
    | 'text/markdown';
}

@Injectable()
export class DocumentInputNormalizerService {
  private readonly chunkSize: number;

  constructor(
    private readonly imageNormalizer: ImageNormalizer,
    @Optional()
    @Inject(DOCUMENT_CHUNK_SIZE)
    chunkSize?: number,
  ) {
    this.chunkSize = chunkSize ?? DEFAULT_DOCUMENT_CHUNK_SIZE;
    if (!Number.isInteger(this.chunkSize) || this.chunkSize < 1) {
      throw new Error('chunkSize must be a positive integer');
    }
  }

  async normalizeUpload(
    input: UploadDocumentInput,
  ): Promise<NormalizedDocumentInput> {
    const contentHash = sha256(input.bytes);

    if (input.mimeType === 'application/pdf') {
      return {
        contentHash,
        normalizedText: null,
        chunks: [],
        parts: [
          {
            kind: 'pdf',
            data: input.bytes,
            mimeType: 'application/pdf',
          },
        ],
        sourceSegments: [],
      };
    }

    if (isImageMimeType(input.mimeType)) {
      const image = await this.imageNormalizer.normalize(
        input.bytes,
        input.mimeType,
      );
      return {
        contentHash,
        normalizedText: null,
        chunks: [],
        parts: [
          { kind: 'image', data: image.buffer, mimeType: image.mimeType },
        ],
        sourceSegments: [],
      };
    }

    const rawText =
      input.mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? (await mammoth.extractRawText({ buffer: input.bytes })).value
        : input.bytes.toString('utf8');
    const normalizedText = normalizeLineEndings(rawText);
    const chunks = deterministicChunks(normalizedText, this.chunkSize);

    return {
      contentHash,
      normalizedText,
      chunks,
      parts: chunks.map(({ text }) => ({ kind: 'text', text })),
      sourceSegments:
        input.mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ? docxSegments(normalizedText)
          : [],
    };
  }

  normalizeNotion(snapshot: NotionPageSnapshot): NormalizedDocumentInput {
    const stableSnapshot: NotionPageSnapshot = {
      pageId: snapshot.pageId,
      title: snapshot.title,
      blocks: [...snapshot.blocks]
        .sort((left, right) =>
          left.position === right.position
            ? left.id.localeCompare(right.id)
            : left.position - right.position,
        )
        .map((block) => ({ ...block, text: normalizeLineEndings(block.text) })),
    };
    const normalizedText = stableSnapshot.blocks
      .map(({ text }) => text)
      .join('\n\n');
    const chunks = deterministicChunks(normalizedText, this.chunkSize);

    return {
      contentHash: sha256(stableJson(stableSnapshot)),
      normalizedText,
      chunks,
      parts: chunks.map(({ text }) => ({ kind: 'text', text })),
      sourceSegments: stableSnapshot.blocks.map((block) => ({
        text: block.text,
        locator: {
          type: 'notion_block',
          blockId: block.id,
          position: block.position,
        },
      })),
      snapshot: stableSnapshot,
    };
  }
}

export function deterministicChunks(
  text: string,
  chunkSize = DEFAULT_DOCUMENT_CHUNK_SIZE,
): DocumentChunk[] {
  if (text.length === 0) {
    return [];
  }
  const chunks: DocumentChunk[] = [];
  for (let start = 0; start < text.length; start += chunkSize) {
    const chunkText = text.slice(start, start + chunkSize);
    chunks.push({
      index: chunks.length,
      text: chunkText,
      hash: sha256(chunkText),
    });
  }
  return chunks;
}

function docxSegments(text: string): NormalizedSourceSegment[] {
  const paragraphs = text.split(/\n{2,}/u).filter((value) => value.length > 0);
  let heading = 'Document';
  return paragraphs.map((paragraph, index) => {
    if (!paragraph.includes('\n') && paragraph.length <= 120) {
      heading = paragraph;
    }
    return {
      text: paragraph,
      locator: { type: 'docx_heading', heading, paragraph: index },
    };
  });
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/gu, '\n');
}

function isImageMimeType(
  value: UploadDocumentInput['mimeType'],
): value is NormalizableImageMimeType {
  return value === 'image/png' || value === 'image/jpeg';
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
