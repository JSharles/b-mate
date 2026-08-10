import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

// specs/014-category-sections research.md Decision 6. The analysis provider
// rejects any image whose long edge exceeds 8000 px, and caps a base64 image
// at 10 MB. It also downscales anything past 2576 px on the long edge before
// looking at it, so normalizing to exactly that ceiling loses no fidelity —
// it just moves a rejection that would otherwise surface minutes later, as an
// opaque per-request batch error, into a deterministic local step.
//
// Confirmed against the real failing upload (T003): 8929 x 7392 px, 732 KB.
// A flat-colour architecture diagram compresses extremely well, which is why
// byte size was a misleading signal — the dimension ceiling is what it broke.
const MAX_LONG_EDGE_PX = 2576;

// Well under the provider's 10 MB base64 ceiling (~7.5 MB raw). Almost never
// the binding constraint once the resize above has run, but it is for a
// photographic upload that is already small enough dimensionally.
const MAX_ENCODED_BYTES = 5 * 1024 * 1024;

// Last-resort re-encode quality, only reached by an image that is still over
// budget after being resized — high enough that diagram labels stay readable.
const FALLBACK_JPEG_QUALITY = 90;

export type NormalizableImageMimeType = 'image/png' | 'image/jpeg';

export interface NormalizedImage {
  buffer: Buffer;
  mimeType: NormalizableImageMimeType;
}

// Thrown when the input isn't a readable image at all (corrupt, truncated, or
// not actually an image despite its declared MIME type). Distinct from an
// image that is merely too large, which is what this class exists to fix —
// the service layer turns this into a 400 at upload time (spec.md FR-025),
// rather than letting it become a resource that fails minutes later.
export class ImageNormalizationError extends Error {}

@Injectable()
export class ImageNormalizer {
  // Returns the image unchanged when it already fits — resizing a conforming
  // image would re-encode it for nothing and could only lose quality.
  async normalize(
    fileBuffer: Buffer,
    mimeType: NormalizableImageMimeType,
  ): Promise<NormalizedImage> {
    const { width, height } = await this.readDimensions(fileBuffer);

    const longEdge = Math.max(width, height);
    if (
      longEdge <= MAX_LONG_EDGE_PX &&
      fileBuffer.length <= MAX_ENCODED_BYTES
    ) {
      return { buffer: fileBuffer, mimeType };
    }

    const resized = await this.encode(
      sharp(fileBuffer).resize({
        width: MAX_LONG_EDGE_PX,
        height: MAX_LONG_EDGE_PX,
        fit: 'inside',
        // Never upscale: an image over the byte budget but under the pixel
        // ceiling must not be blown up on its way to being shrunk.
        withoutEnlargement: true,
      }),
      mimeType,
    );

    if (resized.length <= MAX_ENCODED_BYTES) {
      return { buffer: resized, mimeType };
    }

    // Only reachable for an image that is still oversized at 2576 px — in
    // practice a photograph, not a diagram. PNG is kept everywhere else
    // precisely because lossy artefacts eat small text in schemas.
    const recompressed = await sharp(resized)
      .jpeg({ quality: FALLBACK_JPEG_QUALITY })
      .toBuffer();

    return { buffer: recompressed, mimeType: 'image/jpeg' };
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

    // sharp types both as optional; a format it can't size is one we can't
    // safely hand to the provider either.
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
