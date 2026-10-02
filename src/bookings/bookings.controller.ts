import {
  Headers,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  CurrentUser,
  OptionalSessionGuard,
  SessionGuard,
} from '../auth/session.guard.js';
import { languageFrom } from '../mail/language.js';
import { StorageService } from '../storage/storage.service.js';
import type { User } from '../users/user.entity.js';
import { BookingsService } from './bookings.service.js';
import {
  CancelBookingDto,
  RescheduleBookingDto,
} from './dto/change-booking.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  storeBookingPhotos,
} from './photo-storage.js';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly storage: StorageService,
  ) {}

  /** Anyone can book; it's linked to the account when signed in. */
  @Post()
  @UseGuards(ThrottlerGuard, OptionalSessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('photos', MAX_PHOTOS, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS, fields: 30 },
    }),
  )
  async create(
    @Body() dto: CreateBookingDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @CurrentUser() user?: User,
    @Headers('accept-language') language?: string,
  ) {
    const photos = await storeBookingPhotos(files, this.storage);
    return this.bookings.create(dto, photos, user?.id, languageFrom(language));
  }

  @Get('mine')
  @UseGuards(SessionGuard)
  mine(@CurrentUser() user: User) {
    return this.bookings.listForUser(user.id);
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, SessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reschedule(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.bookings.requestReschedule(
      user.id,
      id,
      dto.preferredDate,
      dto.preferredTime,
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, SessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.requestCancellation(user.id, id, dto.reason);
  }

  /** One of the booking's photos, for its owner only. */
  @Get(':id/photos/:index')
  @UseGuards(SessionGuard)
  async photo(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ) {
    const { photo, stream } = await this.bookings.openPhoto(user.id, id, index);
    return new StreamableFile(stream, {
      type: photo.mimeType,
      length: photo.size,
      disposition: 'inline',
    });
  }
}
