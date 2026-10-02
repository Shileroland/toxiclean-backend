import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { StorageService } from '../storage/storage.service.js';
import type { BookingPhoto } from './booking.entity.js';

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type UploadedPhoto = { buffer: Buffer; originalname: string; size: number };

/** Detects PNG/JPEG from the file's own bytes; the client's MIME type isn't trusted. */
export function detectImageType(
  buffer: Buffer,
): 'image/png' | 'image/jpeg' | null {
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'image/jpeg';
  return null;
}

/** Validates booking photos and stores them under `bookings/` with random names. */
export async function storeBookingPhotos(
  files: UploadedPhoto[],
  storage: StorageService,
): Promise<BookingPhoto[]> {
  if (files.length > MAX_PHOTOS) {
    throw new BadRequestException(`You can upload up to ${MAX_PHOTOS} photos.`);
  }
  const checked = files.map((file) => {
    const mimeType = detectImageType(file.buffer);
    if (!mimeType)
      throw new BadRequestException('Photos must be PNG or JPG images.');
    if (file.size > MAX_PHOTO_BYTES)
      throw new BadRequestException('Each photo must be 5MB or smaller.');
    return { file, mimeType };
  });
  if (checked.length === 0) return [];

  return Promise.all(
    checked.map(async ({ file, mimeType }) => {
      const fileName = `${randomUUID()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
      const stored = await storage.put(
        `bookings/${fileName}`,
        file.buffer,
        mimeType,
      );
      return {
        fileName,
        storage: stored,
        originalName: file.originalname.slice(0, 200),
        mimeType,
        size: file.size,
      };
    }),
  );
}
