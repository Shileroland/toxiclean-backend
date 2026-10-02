import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { detectImageType } from '../bookings/photo-storage.js';
import { StorageService } from '../storage/storage.service.js';
import { CustomerDocument, type DocumentType } from './document.entity.js';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** PDF, PNG or JPEG, judged by the file's own bytes. */
export function detectDocumentType(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  return detectImageType(buffer);
}

export type NewDocument = {
  type: DocumentType;
  title: string;
  reference?: string | null;
  issuedOn: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(CustomerDocument)
    private readonly documents: Repository<CustomerDocument>,
    private readonly storage: StorageService,
  ) {}

  /** The user's documents, newest first, without storage details. */
  async listForUser(userId: string) {
    const rows = await this.documents.find({
      where: { user: { id: userId } },
      order: { issuedOn: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(
      ({ id, type, title, reference, issuedOn, mimeType, size }) => ({
        id,
        type,
        title,
        reference,
        issuedOn,
        mimeType,
        size,
      }),
    );
  }

  /** Opens one of the user's documents; someone else's id is treated as not found. */
  async openForUser(userId: string, id: string) {
    const document = await this.documents.findOne({
      where: { id, user: { id: userId } },
    });
    if (!document) throw new NotFoundException('Document not found.');
    const stream = await this.storage
      .get(`documents/${document.fileName}`, document.storage)
      .catch(() => {
        throw new NotFoundException('Document file is missing.');
      });
    return { document, stream };
  }

  /** Issues a document to a customer. For the admin; not exposed to customers. */
  async addForUser(userId: string, input: NewDocument, file: Buffer) {
    const mimeType = detectDocumentType(file);
    if (!mimeType)
      throw new BadRequestException('Documents must be PDF, PNG or JPG files.');
    if (file.length > MAX_DOCUMENT_BYTES)
      throw new BadRequestException('Documents must be 20MB or smaller.');

    const fileName = `${randomUUID()}.${EXTENSIONS[mimeType]}`;
    const storage = await this.storage.put(
      `documents/${fileName}`,
      file,
      mimeType,
    );
    const saved = await this.documents.save(
      this.documents.create({
        user: { id: userId },
        type: input.type,
        title: input.title.trim(),
        reference: input.reference?.trim() || null,
        issuedOn: input.issuedOn,
        fileName,
        storage,
        mimeType,
        size: file.length,
      }),
    );
    return { id: saved.id };
  }
}
