import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  storeBookingPhotos,
} from '../bookings/photo-storage.js';
import { StorageService } from '../storage/storage.service.js';
import { AdminGuard, CurrentUser } from '../auth/session.guard.js';
import type { User } from '../users/user.entity.js';
import {
  AdminLeadsService,
  isLeadSource,
  isLeadStatus,
} from './admin-leads.service.js';
import { countryParam } from './admin.controller.js';
import { AdminCreateBookingDto } from './dto/admin-booking.dto.js';
import {
  AssignLeadDto,
  LogLeadContactDto,
  MarkLeadLostDto,
  SiteSurveyDto,
} from './dto/admin-lead.dto.js';

/** Website enquiries being followed up (the Leads tab of Customers). */
@Controller('admin/leads')
@UseGuards(AdminGuard)
export class AdminLeadsController {
  constructor(
    private readonly leads: AdminLeadsService,
    private readonly storage: StorageService,
  ) {}

  /** ?country=NG&q=…&status=new,contacted&source=bulk_quote&page=1 */
  @Get()
  list(
    @Query('country') country?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('page') page?: string,
  ) {
    return this.leads.list({
      country: countryParam(country),
      q: q?.trim().slice(0, 100) || undefined,
      statuses: (status ?? '').split(',').filter(isLeadStatus),
      sources: (source ?? '').split(',').filter(isLeadSource),
      page: Math.max(
        1,
        Math.min(10_000, Number.parseInt(page ?? '1', 10) || 1),
      ),
    });
  }

  @Get('staff')
  staff() {
    return this.leads.staff();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.leads.get(id);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignLeadDto) {
    return this.leads.assign(id, dto.userId);
  }

  @Post(':id/contacts')
  @HttpCode(200)
  logContact(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LogLeadContactDto,
    @CurrentUser() user: User,
  ) {
    return this.leads.logContact(id, dto, user);
  }

  @Post(':id/lost')
  @HttpCode(200)
  markLost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkLeadLostDto,
  ) {
    return this.leads.markLost(id, dto);
  }

  /** The customer (and location) to book a service lead's job for. */
  @Post(':id/conversion-customer')
  @HttpCode(200)
  conversionCustomer(@Param('id', ParseIntPipe) id: number) {
    return this.leads.conversionCustomer(id);
  }

  /** Convert to Job: schedules the lead's booking; the lead is won. */
  @Post(':id/convert')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('photos', MAX_PHOTOS, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS, fields: 40 },
    }),
  )
  async convert(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminCreateBookingDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const photos = await storeBookingPhotos(files, this.storage);
    return this.leads.convert(id, dto, photos);
  }

  /** Bulk quote leads: the accepted quotation becomes a purchase request. */
  @Post(':id/convert-to-request')
  @HttpCode(200)
  convertToRequest(@Param('id', ParseIntPipe) id: number) {
    return this.leads.convertToRequest(id);
  }

  @Put(':id/survey')
  saveSurvey(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SiteSurveyDto,
  ) {
    return this.leads.saveSurvey(id, dto);
  }

  @Post(':id/survey/photos')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('photos', MAX_PHOTOS, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS },
    }),
  )
  addSurveyPhotos(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.leads.addSurveyPhotos(id, files);
  }

  @Delete(':id/survey/photos/:index')
  removeSurveyPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.leads.removeSurveyPhoto(id, index);
  }

  @Get(':id/survey/photos/:index')
  async surveyPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ) {
    const { photo, stream } = await this.leads.openSurveyPhoto(id, index);
    return new StreamableFile(stream, {
      type: photo.mimeType,
      length: photo.size,
      disposition: 'inline',
    });
  }
}
