import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { detectImageType, MAX_PHOTO_BYTES } from '../bookings/photo-storage.js';
import type { StorageService } from '../storage/storage.service.js';
import type { CertificateDocument } from './fumigator.entity.js';

type Upload = { buffer: Buffer; originalname: string; size: number };

export const DOCUMENT_EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
} as const;

/** PDF from its "%PDF-" header; images as for booking photos. The client's MIME type isn't trusted. */
export function detectDocumentType(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  return detectImageType(buffer);
}

/** Validates a certificate document and stores it under `certificates/` with a random name. */
export async function storeCertificateDocument(
  file: Upload,
  storage: StorageService,
): Promise<CertificateDocument> {
  const mimeType = detectDocumentType(file.buffer);
  if (!mimeType) {
    throw new BadRequestException(
      'Certificates must be PDF, PNG or JPG files.',
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new BadRequestException('The certificate must be 5MB or smaller.');
  }
  const fileName = `${randomUUID()}.${DOCUMENT_EXTENSIONS[mimeType]}`;
  const stored = await storage.put(
    `certificates/${fileName}`,
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
