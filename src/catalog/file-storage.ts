import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { detectImageType, MAX_PHOTO_BYTES } from '../bookings/photo-storage.js';
import {
  detectDocumentType,
  DOCUMENT_EXTENSIONS,
} from '../fumigators/certificate-storage.js';
import type { StorageService } from '../storage/storage.service.js';
import type { StoredFile } from './catalog.entity.js';

export type Upload = { buffer: Buffer; originalname: string; size: number };

export type CatalogFolder = 'products' | 'brands' | 'expenses';

/**
 * Checks and stores one file under `folder/` with a random name. `images` allows PNG/JPG
 * only; otherwise PDF too. The client's MIME type isn't trusted.
 */
export async function storeCatalogFile(
  file: Upload,
  storage: StorageService,
  folder: CatalogFolder,
  { images = false, noun = 'file' } = {},
): Promise<StoredFile> {
  const mimeType = images
    ? detectImageType(file.buffer)
    : detectDocumentType(file.buffer);
  if (!mimeType) {
    throw new BadRequestException(
      images
        ? 'Images must be PNG or JPG files.'
        : `The ${noun} must be a PDF, PNG or JPG file.`,
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new BadRequestException(`The ${noun} must be 5MB or smaller.`);
  }
  const fileName = `${randomUUID()}.${DOCUMENT_EXTENSIONS[mimeType]}`;
  const stored = await storage.put(
    `${folder}/${fileName}`,
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
}

/** What clients see of a stored file: never its storage name. */
export const fileInfo = (f: StoredFile | null) =>
  f && { originalName: f.originalName, mimeType: f.mimeType, size: f.size };
