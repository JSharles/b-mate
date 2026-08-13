import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DocumentStorageClient {
  constructor(private readonly config: ConfigService) {}

  private configuration(): { bucket: string; client: S3Client } {
    const config = this.config;
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = config.get<string>('R2_BUCKET_NAME');
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('R2 storage configuration is incomplete.');
    }
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    return { bucket, client };
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    const { bucket, client } = this.configuration();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  getDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    const { bucket, client } = this.configuration();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  async get(key: string): Promise<Buffer> {
    const { bucket, client } = this.configuration();
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error('Stored document body is missing.');
    }
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    const { bucket, client } = this.configuration();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
