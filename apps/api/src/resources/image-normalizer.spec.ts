import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { ImageNormalizationError, ImageNormalizer } from './image-normalizer';

// Real images rather than a mocked sharp: the whole point of this class is
// what sharp actually does to real pixel data (does it enlarge? does it keep
// the aspect ratio? does re-encoding get under budget?), none of which a mock
// would tell us. Fixtures are generated rather than committed so the exact
// dimensions under test are visible in the test itself.
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

// Random pixels don't compress, which is the only cheap way to build an image
// that is small in dimensions yet large in bytes — the branch a diagram never
// reaches but a photograph does.
function noisePng(size: number): Promise<Buffer> {
  return sharp(randomBytes(size * size * 3), {
    raw: { width: size, height: size, channels: 3 },
  })
    .png()
    .toBuffer();
}

describe('ImageNormalizer', () => {
  const normalizer = new ImageNormalizer();

  it('leaves an already-conforming image untouched', async () => {
    const input = await solidPng(800, 600);

    const result = await normalizer.normalize(input, 'image/png');

    // Identity, not just equivalence — a conforming image must not be
    // re-encoded, which could only cost quality and time.
    expect(result.buffer).toBe(input);
    expect(result.mimeType).toBe('image/png');
  });

  it('resizes an image whose long edge exceeds the ceiling', async () => {
    // The shape of the real failing upload (8929 x 7392), scaled down so the
    // test stays fast while still crossing the 2576 px ceiling.
    const input = await solidPng(8929, 3000);

    const result = await normalizer.normalize(input, 'image/png');
    const { width, height } = await sharp(result.buffer).metadata();

    expect(width).toBe(2576);
    expect(result.mimeType).toBe('image/png');
    // Aspect ratio preserved: 8929/3000 ≈ 2.976, so height lands near 866.
    expect(height).toBe(Math.round((3000 * 2576) / 8929));
  });

  it('resizes against the long edge whichever way the image is oriented', async () => {
    const input = await solidPng(3000, 8929);

    const result = await normalizer.normalize(input, 'image/png');
    const { width, height } = await sharp(result.buffer).metadata();

    expect(height).toBe(2576);
    expect(width).toBe(Math.round((3000 * 2576) / 8929));
  });

  it('re-encodes an image that is under the pixel ceiling but over the byte budget, without enlarging it', async () => {
    // 1600 px square of noise: comfortably under 2576 px, comfortably over
    // the 5 MB budget once PNG-encoded.
    const input = await noisePng(1600);
    expect(input.length).toBeGreaterThan(5 * 1024 * 1024);

    const result = await normalizer.normalize(input, 'image/png');
    const { width, height } = await sharp(result.buffer).metadata();

    // withoutEnlargement: a 1600 px image must not be blown up to 2576 on its
    // way to being made smaller.
    expect(width).toBe(1600);
    expect(height).toBe(1600);
    expect(result.buffer.length).toBeLessThan(input.length);
    expect(result.mimeType).toBe('image/jpeg');
  }, 30_000);

  it('keeps JPEG input as JPEG when it only needs resizing', async () => {
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
    const { width, format } = await sharp(result.buffer).metadata();

    expect(width).toBe(2576);
    expect(format).toBe('jpeg');
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('raises a typed error for input that is not a readable image', async () => {
    await expect(
      normalizer.normalize(Buffer.from('this is not an image'), 'image/png'),
    ).rejects.toBeInstanceOf(ImageNormalizationError);
  });

  it('raises a typed error for a truncated image', async () => {
    const input = await solidPng(400, 400);

    await expect(
      normalizer.normalize(input.subarray(0, 20), 'image/png'),
    ).rejects.toBeInstanceOf(ImageNormalizationError);
  });
});
