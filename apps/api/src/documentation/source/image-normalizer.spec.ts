import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { ImageNormalizationError, ImageNormalizer } from './image-normalizer';

function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 12, g: 74, b: 110 },
    },
  })
    .png()
    .toBuffer();
}

describe('ImageNormalizer', () => {
  const normalizer = new ImageNormalizer();

  it('preserves a conforming image by identity', async () => {
    const input = await solidPng(800, 600);
    const result = await normalizer.normalize(input, 'image/png');
    expect(result).toEqual({ buffer: input, mimeType: 'image/png' });
    expect(result.buffer).toBe(input);
  });

  it.each([
    [8929, 3000, 2576, Math.round((3000 * 2576) / 8929)],
    [3000, 8929, Math.round((3000 * 2576) / 8929), 2576],
  ])(
    'resizes the long edge without changing aspect ratio',
    async (width, height, expectedWidth, expectedHeight) => {
      const result = await normalizer.normalize(
        await solidPng(width, height),
        'image/png',
      );
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata).toMatchObject({
        width: expectedWidth,
        height: expectedHeight,
      });
      expect(result.mimeType).toBe('image/png');
    },
  );

  it('keeps resized JPEG input as JPEG', async () => {
    const input = await sharp({
      create: {
        width: 5000,
        height: 2000,
        channels: 3,
        background: { r: 200, g: 30, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();
    const result = await normalizer.normalize(input, 'image/jpeg');
    expect(result.mimeType).toBe('image/jpeg');
    expect((await sharp(result.buffer).metadata()).width).toBe(2576);
  });

  it('recompresses a byte-heavy image without enlarging it', async () => {
    const size = 1600;
    const input = await sharp(randomBytes(size * size * 3), {
      raw: { width: size, height: size, channels: 3 },
    })
      .png()
      .toBuffer();
    const result = await normalizer.normalize(input, 'image/png');
    expect(result.mimeType).toBe('image/jpeg');
    expect(await sharp(result.buffer).metadata()).toMatchObject({
      width: size,
      height: size,
    });
  }, 30_000);

  it('raises a typed error for unreadable bytes', async () => {
    await expect(
      normalizer.normalize(Buffer.from('not an image'), 'image/png'),
    ).rejects.toBeInstanceOf(ImageNormalizationError);
  });
});
