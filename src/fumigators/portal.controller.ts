import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_PHOTO_BYTES, MAX_PHOTOS } from '../bookings/photo-storage.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { Fumigator } from './fumigator.entity.js';
import { CurrentFumigator, FumigatorGuard } from './fumigator.guard.js';
import {
  CompleteBookingDto,
  PORTAL_TABS,
  type PortalTab,
} from './portal.dto.js';
import {
  type CompletionFiles,
  FILE_KINDS,
  type FileKind,
  PortalService,
} from './portal.service.js';

const isTab = (v: string): v is PortalTab =>
  (PORTAL_TABS as readonly string[]).includes(v);
const isFileKind = (v: string): v is FileKind =>
  (FILE_KINDS as readonly string[]).includes(v);

/** The fumigator field portal; every route acts on the signed-in fumigator's own jobs. */
@Controller('fumigator')
@UseGuards(FumigatorGuard)
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('me')
  me(@CurrentFumigator() f: Fumigator) {
    return {
      id: f.id,
      fullName: f.fullName,
      country: f.country,
      branch: f.branch,
    };
  }

  /** Catalog chemicals, for Chemicals Used on Complete Booking. */
  @Get('chemicals')
  async chemicals() {
    const products = await this.catalog.productOptions('chemicals');
    return products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
  }

  /** ?tab=today|upcoming|history&page=1 (history is paged). */
  @Get('bookings')
  list(
    @CurrentFumigator() f: Fumigator,
    @Query('tab') tab = 'today',
    @Query('page') page?: string,
  ) {
    if (!isTab(tab)) throw new BadRequestException('Unknown tab.');
    return this.portal.list(f, tab, Math.max(1, Number(page) || 1));
  }

  @Get('bookings/:id')
  get(@CurrentFumigator() f: Fumigator, @Param('id', ParseIntPipe) id: number) {
    return this.portal.get(f, id);
  }

  @Post('bookings/:id/en-route')
  @HttpCode(200)
  enRoute(
    @CurrentFumigator() f: Fumigator,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portal.step(f, id, 'en-route');
  }

  @Post('bookings/:id/arrived')
  @HttpCode(200)
  arrived(
    @CurrentFumigator() f: Fumigator,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portal.step(f, id, 'arrived');
  }

  /** Multipart: the treatment fields, `before` and `after` photos, one `signOff` file. */
  @Post('bookings/:id/complete')
  @HttpCode(200)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'before', maxCount: MAX_PHOTOS },
        { name: 'after', maxCount: MAX_PHOTOS },
        { name: 'signOff', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: MAX_PHOTO_BYTES,
          files: MAX_PHOTOS * 2 + 1,
          fields: 10,
        },
      },
    ),
  )
  complete(
    @CurrentFumigator() f: Fumigator,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteBookingDto,
    @UploadedFiles() files: CompletionFiles = {},
  ) {
    return this.portal.complete(f, id, dto, files);
  }

  /** kind: photos (the customer's), before, after or signoff (index 0). */
  @Get('bookings/:id/files/:kind/:index')
  async file(
    @CurrentFumigator() f: Fumigator,
    @Param('id', ParseIntPipe) id: number,
    @Param('kind') kind: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    if (!isFileKind(kind)) throw new BadRequestException('Unknown file.');
    const { file, stream } = await this.portal.openFile(f, id, kind, index);
    return new StreamableFile(stream, {
      type: file.mimeType,
      length: file.size,
      disposition: 'inline',
    });
  }
}
