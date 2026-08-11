import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

const MAX_LONG_EDGE_PX = 2576;
const MAX_ENCODED_BYTES = 5 * 1024 * 1024;
const FALLBACK_JPEG_QUALITY = 90;

export type NormalizableImageMimeType = 'image/png' | 'image/jpeg';
export interface NormalizedImage {
  buffer: Buffer;
  mimeType: NormalizableImageMimeType;
}

export class ImageNormalizationError extends Error {}

@Injectable()
export class ImageNormalizer {
  async normalize(
    fileBuffer: Buffer,
    mimeType: NormalizableImageMimeType,
  ): Promise<NormalizedImage> {
    const { width, height } = await this.readDimensions(fileBuffer);
    if (
      Math.max(width, height) <= MAX_LONG_EDGE_PX &&
      fileBuffer.length <= MAX_ENCODED_BYTES
    ) {
      return { buffer: fileBuffer, mimeType };
    }
    const resized = await this.encode(
      sharp(fileBuffer).resize({
        width: MAX_LONG_EDGE_PX,
        height: MAX_LONG_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      }),
      mimeType,
    );
    if (resized.length <= MAX_ENCODED_BYTES) {
      return { buffer: resized, mimeType };
    }
    return {
      buffer: await sharp(resized)
        .jpeg({ quality: FALLBACK_JPEG_QUALITY })
        .toBuffer(),
      mimeType: 'image/jpeg',
    };
  }

  private async readDimensions(
    fileBuffer: Buffer,
  ): Promise<{ width: number; height: number }> {
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(fileBuffer).metadata();
    } catch (error) {
      throw new ImageNormalizationError(
        `Unreadable image: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!metadata.width || !metadata.height) {
      throw new ImageNormalizationError(
        'Unreadable image: dimensions could not be determined',
      );
    }
    return { width: metadata.width, height: metadata.height };
  }

  private encode(
    pipeline: sharp.Sharp,
    mimeType: NormalizableImageMimeType,
  ): Promise<Buffer> {
    return mimeType === 'image/png'
      ? pipeline.png({ compressionLevel: 9 }).toBuffer()
      : pipeline.jpeg({ quality: FALLBACK_JPEG_QUALITY }).toBuffer();
  }
}
