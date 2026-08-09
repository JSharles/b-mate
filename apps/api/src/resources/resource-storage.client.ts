import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 is S3-API-compatible (research.md Decision 6) — the
// official AWS SDK works against it unmodified, pointed at R2's own
// endpoint. Env vars are read lazily (per call, not in the constructor) so
// the app can still boot in environments where R2 hasn't been provisioned
// yet (e.g. running the rest of the test suite before the bucket exists) —
// same reasoning as GithubOauthClient's clientId()/clientSecret().
@Injectable()
export class ResourceStorageClient {
  private client(): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${this.accountId()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.accessKeyId(),
        secretAccessKey: this.secretAccessKey(),
      },
    });
  }

  async uploadFile(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client().send(
      new PutObjectCommand({
        Bucket: this.bucketName(),
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  async getPresignedDownloadUrl(
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client(),
      new GetObjectCommand({ Bucket: this.bucketName(), Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  async deleteFile(key: string): Promise<void> {
    await this.client().send(
      new DeleteObjectCommand({ Bucket: this.bucketName(), Key: key }),
    );
  }

  private accountId(): string {
    return process.env.R2_ACCOUNT_ID ?? '';
  }

  private accessKeyId(): string {
    return process.env.R2_ACCESS_KEY_ID ?? '';
  }

  private secretAccessKey(): string {
    return process.env.R2_SECRET_ACCESS_KEY ?? '';
  }

  private bucketName(): string {
    return process.env.R2_BUCKET_NAME ?? '';
  }
}
