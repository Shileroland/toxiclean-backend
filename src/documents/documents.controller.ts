import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import type { User } from '../users/user.entity.js';
import { DocumentsService } from './documents.service.js';

/** Turns a title into a safe download name, e.g. "Termite Control Invoice.pdf". */
export function downloadName(title: string, mimeType: string) {
  const ext =
    mimeType === 'application/pdf'
      ? 'pdf'
      : mimeType === 'image/png'
        ? 'png'
        : 'jpg';
  const base =
    title
      .replace(/[^\p{L}\p{N} ._-]+/gu, '')
      .trim()
      .slice(0, 100) || 'document';
  return `${base}.${ext}`;
}

@Controller('documents')
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.documents.listForUser(user.id);
  }

  /** Streams the file. `?download=1` saves it; otherwise browsers show it inline. */
  @Get(':id/file')
  async file(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download?: string,
  ) {
    const { document, stream } = await this.documents.openForUser(user.id, id);
    const name = downloadName(document.title, document.mimeType);
    return new StreamableFile(stream, {
      type: document.mimeType,
      length: document.size,
      disposition: `${download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }
}
