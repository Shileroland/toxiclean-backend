import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/session.guard.js';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  storeBookingPhotos,
} from '../bookings/photo-storage.js';
import { StorageService } from '../storage/storage.service.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import { countryParam } from './admin.controller.js';
import {
  AdminCreateBookingDto,
  FollowUpRequiredDto,
  FumigatorsDto,
  ScheduleDto,
  StatusDto,
  TreatmentPlanDto,
} from './dto/admin-booking.dto.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The longest range the calendar asks for (a month view with spill-over weeks). */
const MAX_RANGE_DAYS = 62;

@Controller('admin/bookings')
@UseGuards(AdminGuard)
export class AdminBookingsController {
  constructor(
    private readonly bookings: AdminBookingsService,
    private readonly storage: StorageService,
  ) {}

  /** Calendar: jobs overlapping from..to (YYYY-MM-DD, inclusive). */
  @Get()
  calendar(
    @Query('country') country?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fumigator') fumigatorId?: string,
    @Query('service') service?: string,
  ) {
    if (!from || !to || !DATE.test(from) || !DATE.test(to) || to < from) {
      throw new BadRequestException('from and to must be YYYY-MM-DD dates.');
    }
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException('Ask for at most two months at a time.');
    }
    return this.bookings.calendar({
      country: countryParam(country),
      from,
      to,
      fumigatorId: fumigatorId || undefined,
      service: service || undefined,
    });
  }

  @Get('attention')
  attention(@Query('country') country?: string) {
    return this.bookings.needsAttention(countryParam(country));
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('photos', MAX_PHOTOS, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS, fields: 40 },
    }),
  )
  async create(
    @Body() dto: AdminCreateBookingDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const photos = await storeBookingPhotos(files, this.storage);
    return this.bookings.create(dto, photos);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.bookings.get(id);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  schedule(@Param('id', ParseIntPipe) id: number, @Body() dto: ScheduleDto) {
    return this.bookings.schedule(id, dto);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto) {
    return this.bookings.changeStatus(id, dto);
  }

  @Post(':id/decline-request')
  @HttpCode(200)
  declineRequest(@Param('id', ParseIntPipe) id: number) {
    return this.bookings.declineRequest(id);
  }

  @Post(':id/follow-up-required')
  @HttpCode(200)
  followUpRequired(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FollowUpRequiredDto,
  ) {
    return this.bookings.markFollowUpRequired(id, dto.reason);
  }

  /** Creates the follow-up job; returns it (the original is closed). */
  @Post(':id/follow-up')
  followUp(@Param('id', ParseIntPipe) id: number, @Body() dto: ScheduleDto) {
    return this.bookings.scheduleFollowUp(id, dto);
  }

  @Patch(':id/fumigators')
  fumigators(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FumigatorsDto,
  ) {
    return this.bookings.assignFumigators(id, dto.fumigatorIds);
  }

  @Patch(':id/treatment-plan')
  treatmentPlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TreatmentPlanDto,
  ) {
    return this.bookings.setTreatmentPlan(id, dto.treatmentPlan);
  }

  @Get(':id/photos/:index')
  async photo(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ) {
    const { photo, stream } = await this.bookings.openPhoto(id, index);
    return new StreamableFile(stream, {
      type: photo.mimeType,
      length: photo.size,
      disposition: 'inline',
    });
  }
}
