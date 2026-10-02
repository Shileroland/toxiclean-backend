import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from './storage.service.js';

const configWith = (values: Record<string, string>) =>
  ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  }) as never;

describe('StorageService', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'toxiclean-uploads-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes to local disk when no bucket is configured', async () => {
    const storage = new StorageService(configWith({ UPLOADS_DIR: dir }));
    expect(storage.driver).toBe('local');
    await expect(
      storage.put('bookings/a.jpg', Buffer.from('jpeg'), 'image/jpeg'),
    ).resolves.toBe('local');
    expect(await readFile(join(dir, 'bookings/a.jpg'), 'utf8')).toBe('jpeg');
  });

  it('never overwrites an existing file', async () => {
    const storage = new StorageService(configWith({ UPLOADS_DIR: dir }));
    await storage.put('bookings/a.jpg', Buffer.from('one'), 'image/jpeg');
    await expect(
      storage.put('bookings/a.jpg', Buffer.from('two'), 'image/jpeg'),
    ).rejects.toThrow();
  });

  it('switches to S3 when S3_BUCKET is set', () => {
    const storage = new StorageService(
      configWith({ S3_BUCKET: 'toxiclean-uploads', S3_REGION: 'eu-west-1' }),
    );
    expect(storage.driver).toBe('s3');
  });
});
