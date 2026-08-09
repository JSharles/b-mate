import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ResourceStorageClient } from './resource-storage.client';

const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => {
  const actual =
    jest.requireActual<typeof import('@aws-sdk/client-s3')>(
      '@aws-sdk/client-s3',
    );
  return {
    ...actual,
    // Every `new S3Client(...)` call returns an object sharing the same
    // `mockSend` reference, so tests can assert on it regardless of how
    // many times the client under test constructs a fresh S3Client.
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockedGetSignedUrl = jest.mocked(getSignedUrl);

describe('ResourceStorageClient', () => {
  let client: ResourceStorageClient;

  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = 'account-1';
    process.env.R2_ACCESS_KEY_ID = 'key-1';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-1';
    process.env.R2_BUCKET_NAME = 'diaphane-resources';
    client = new ResourceStorageClient();
    mockSend.mockClear();
    mockedGetSignedUrl.mockReset();
  });

  it('uploads a file with the given key, body, and content type', async () => {
    await client.uploadFile(
      'resources/a.pdf',
      Buffer.from('data'),
      'application/pdf',
    );

    expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
  });

  it('generates a presigned download URL with the given TTL', async () => {
    mockedGetSignedUrl.mockResolvedValue('https://r2.example.com/signed');

    const url = await client.getPresignedDownloadUrl('resources/a.pdf', 900);

    expect(url).toBe('https://r2.example.com/signed');
    expect(mockedGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(GetObjectCommand),
      { expiresIn: 900 },
    );
  });

  it('deletes a file by key', async () => {
    await client.deleteFile('resources/a.pdf');

    expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
  });
});
