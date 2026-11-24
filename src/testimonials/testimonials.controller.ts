import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/session.guard.js';
import { MAX_PHOTO_BYTES } from '../bookings/photo-storage.js';
import type { StoredFile } from '../catalog/catalog.entity.js';
import {
  TestimonialDto,
  TestimonialMoveDto,
  TestimonialVisibilityDto,
} from './testimonial.dto.js';
import {
  TESTIMONIAL_SEGMENTS,
  type TestimonialSegment,
} from './testimonial.entity.js';
import { TestimonialsService } from './testimonials.service.js';

const pageParam = (page?: string) =>
  Math.max(1, Math.min(10_000, Number.parseInt(page ?? '1', 10) || 1));

const segmentsParam = (value?: string) =>
  (value ?? '')
    .split(',')
    .filter((v): v is TestimonialSegment =>
      (TESTIMONIAL_SEGMENTS as readonly string[]).includes(v),
    );

const inline = (file: StoredFile, stream: NodeJS.ReadableStream) =>
  new StreamableFile(stream as never, {
    type: file.mimeType,
    length: file.size,
    disposition: 'inline',
  });

@Controller('admin/testimonials')
@UseGuards(AdminGuard)
export class AdminTestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  /** ?q=…&segment=agriculture,institutional&visibility=visible|hidden&page=1 */
  @Get('list')
  list(
    @Query('q') q?: string,
    @Query('segment') segment?: string,
    @Query('visibility') visibility?: string,
    @Query('page') page?: string,
  ) {
    return this.testimonials.page({
      q: q?.trim().slice(0, 100) || undefined,
      segments: segmentsParam(segment),
      published:
        visibility === 'visible'
          ? true
          : visibility === 'hidden'
            ? false
            : undefined,
      page: pageParam(page),
    });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.testimonials.get(id);
  }

  @Post()
  create(@Body() dto: TestimonialDto) {
    return this.testimonials.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TestimonialDto) {
    return this.testimonials.update(id, dto);
  }

  /** Show or hide it on the website: { published: boolean }. */
  @Patch(':id/visibility')
  setVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestimonialVisibilityDto,
  ) {
    return this.testimonials.setVisibility(id, dto.published);
  }

  /** One place earlier or later in the display order: { direction: 'up' | 'down' }. */
  @Post(':id/move')
  @HttpCode(200)
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestimonialMoveDto,
  ) {
    return this.testimonials.move(id, dto.direction);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.testimonials.remove(id);
  }

  /** Multipart `photo` (PNG/JPG): the customer's photo or company logo. */
  @Post(':id/photo')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  setPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() photo: Express.Multer.File,
  ) {
    return this.testimonials.setPhoto(id, photo);
  }

  @Delete(':id/photo')
  removePhoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.testimonials.removePhoto(id);
  }

  @Get(':id/photo')
  async photo(@Param('id', ParseUUIDPipe) id: string) {
    const { file, stream } = await this.testimonials.openPhotoFor(id);
    return inline(file, stream);
  }
}

/** Public: the published testimonials and their photos (random names). */
@Controller('testimonials')
export class PublicTestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get()
  list() {
    return this.testimonials.published();
  }

  @Get('photos/:fileName')
  @Header('Cache-Control', 'public, max-age=86400')
  async photo(@Param('fileName') fileName: string) {
    const { file, stream } = await this.testimonials.openPhoto(
      /^[\w-]+\.(png|jpg)$/.test(fileName) ? fileName : 'invalid',
    );
    return inline(file, stream);
  }
}
