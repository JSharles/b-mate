const send = jest.fn();
const s3Constructor = jest.fn();
const signedUrl = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((options: unknown) => {
    s3Constructor(options);
    return { send };
  }),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    type: 'put',
    input,
  })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    type: 'get',
    input,
  })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    type: 'delete',
    input,
  })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => signedUrl(...args),
}));

import { ConfigService } from '@nestjs/config';
import { DocumentStorageClient } from './document-storage.client';

describe('DocumentStorageClient', () => {
  let client: DocumentStorageClient;

  beforeEach(() => {
    jest.clearAllMocks();
    const values: Record<string, string> = {
      R2_ACCOUNT_ID: 'account',
      R2_ACCESS_KEY_ID: 'access',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET_NAME: 'documents',
    };
    client = new DocumentStorageClient({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);
  });

  it('stores original bytes unchanged with their declared MIME type', async () => {
    const bytes = Buffer.from('%PDF-original');

    await client.put(
      'documentation/project-1/document-1/original.pdf',
      bytes,
      'application/pdf',
    );

    expect(s3Constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'auto',
        endpoint: 'https://account.r2.cloudflarestorage.com',
      }),
    );
    expect(send).toHaveBeenCalledWith({
      type: 'put',
      input: {
        Bucket: 'documents',
        Key: 'documentation/project-1/document-1/original.pdf',
        Body: bytes,
        ContentType: 'application/pdf',
      },
    });
  });

  it('creates a short-lived contributor URL and supports idempotent deletion', async () => {
    signedUrl.mockResolvedValue('https://signed.example/original');

    await expect(client.getDownloadUrl('object-key', 900)).resolves.toBe(
      'https://signed.example/original',
    );
    await client.delete('object-key');

    expect(signedUrl).toHaveBeenCalledWith(
      expect.anything(),
      { type: 'get', input: { Bucket: 'documents', Key: 'object-key' } },
      { expiresIn: 900 },
    );
    expect(send).toHaveBeenCalledWith({
      type: 'delete',
      input: { Bucket: 'documents', Key: 'object-key' },
    });
  });

  it('lets the API boot but fails the storage operation when configuration is incomplete', async () => {
    const unconfigured = new DocumentStorageClient({
      get: jest.fn(),
    } as unknown as ConfigService);

    await expect(
      unconfigured.put('key', Buffer.from('data'), 'application/pdf'),
    ).rejects.toThrow('R2 storage configuration');
  });
});
