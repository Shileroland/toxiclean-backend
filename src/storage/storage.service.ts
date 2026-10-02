import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';

export type StorageDriver = 'local' | 's3';

/**
 * Stores uploaded files. Uses the S3 bucket in S3_BUCKET when set, otherwise local
 * disk under UPLOADS_DIR (fine for development and a single server). Files are
 * private either way; nothing here makes them publicly readable.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly driver: StorageDriver;
  private readonly s3?: S3Client;
  private readonly bucket?: string;
  private readonly prefix: string;
  private readonly uploadsDir: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') || undefined;
    this.prefix = (config.get<string>('S3_PREFIX') ?? '').replace(
      /^\/+|\/+$/g,
      '',
    );
    this.uploadsDir = config.get<string>('UPLOADS_DIR', 'uploads');
    this.driver = this.bucket ? 's3' : 'local';

    if (this.bucket) {
      const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
      const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');
      const endpoint = config.get<string>('S3_ENDPOINT') || undefined;
      this.s3 = new S3Client({
        region: config.get<string>('S3_REGION', 'eu-west-1'),
        // Without explicit keys the SDK's default chain is used (e.g. an IAM role).
        credentials:
          accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined,
        // For S3-compatible services (Cloudflare R2, DigitalOcean Spaces, MinIO).
        endpoint,
        forcePathStyle: Boolean(endpoint),
      });
      this.logger.log(`Storing uploads in S3 bucket ${this.bucket}`);
    }
  }

  /** Saves a file under `key` (e.g. `bookings/<uuid>.jpg`). Never overwrites. */
  async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StorageDriver> {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.prefix ? `${this.prefix}/${key}` : key,
          Body: body,
          ContentType: contentType,
          IfNoneMatch: '*',
        }),
      );
      return 's3';
    }
    const path = join(this.uploadsDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' });
    return 'local';
  }

  /**
   * Opens a stored file for streaming. `driver` is where it was saved, so files
   * written to local disk stay readable after switching to S3.
   */
  async get(key: string, driver: StorageDriver = 'local'): Promise<Readable> {
    if (driver === 's3') {
      if (!this.s3 || !this.bucket) {
        throw new Error('File is in S3 but S3_BUCKET is not configured.');
      }
      const { Body } = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.prefix ? `${this.prefix}/${key}` : key,
        }),
      );
      if (!(Body instanceof Readable)) throw new Error('Empty S3 response.');
      return Body;
    }
    const stream = createReadStream(join(this.uploadsDir, key));
    // Surface "file missing" here rather than mid-response.
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', reject);
    });
    return stream;
  }
}
