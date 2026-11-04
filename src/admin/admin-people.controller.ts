import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_PHOTO_BYTES } from '../bookings/photo-storage.js';
import { AdminGuard } from '../auth/session.guard.js';
import {
  CUSTOMER_TYPES,
  type CustomerType,
} from '../customers/customer.entity.js';
import { CustomerDto, LocationDto } from '../customers/customer.dto.js';
import { CustomersService } from '../customers/customers.service.js';
import {
  AvailabilityDto,
  CertificateDto,
  FumigatorDto,
  UpdateFumigatorDto,
} from '../fumigators/fumigator.dto.js';
import {
  AVAILABILITIES,
  BRANCHES,
  SKILLS,
  WEEKDAYS,
  type Availability,
} from '../fumigators/fumigator.entity.js';
import {
  CERTIFICATE_STATUSES,
  type CertificateStatus,
  FumigatorsService,
} from '../fumigators/fumigators.service.js';

const isAvailability = (v: string): v is Availability =>
  (AVAILABILITIES as readonly string[]).includes(v);
const isCertificateStatus = (v: string): v is CertificateStatus =>
  (CERTIFICATE_STATUSES as readonly string[]).includes(v);

/** One optional certificate document per upload. */
const documentUpload = FileInterceptor('document', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 10 },
});
import { AdminCustomersService } from './admin-customers.service.js';
import { countryParam } from './admin.controller.js';

const isCustomerType = (value: string): value is CustomerType =>
  (CUSTOMER_TYPES as readonly string[]).includes(value);

@Controller('admin/customers')
@UseGuards(AdminGuard)
export class AdminCustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly directory: AdminCustomersService,
  ) {}

  /** Up to 10 customers matching `q` (name, phone or email), for pickers. */
  @Get()
  search(@Query('country') country?: string, @Query('q') q?: string) {
    return this.customers.search(countryParam(country), q);
  }

  /** The Customers page: ?country=NG&q=…&type=individual,business&page=1 */
  @Get('list')
  list(
    @Query('country') country?: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
  ) {
    return this.directory.list({
      country: countryParam(country),
      q: q?.trim().slice(0, 100) || undefined,
      types: (type ?? '').split(',').filter(isCustomerType),
      page: Math.max(
        1,
        Math.min(10_000, Number.parseInt(page ?? '1', 10) || 1),
      ),
    });
  }

  @Post()
  create(@Body() dto: CustomerDto) {
    return this.customers.create(dto);
  }

  /** Details, locations, recent requests and bookings, and history. */
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.directory.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerDto) {
    return this.customers.update(id, dto);
  }

  @Get(':id/locations')
  locations(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.listLocations(id);
  }

  @Post(':id/locations')
  addLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LocationDto,
  ) {
    return this.customers.addLocation(id, dto);
  }

  @Patch(':id/locations/:locationId')
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: LocationDto,
  ) {
    return this.customers.updateLocation(id, locationId, dto);
  }
}

@Controller('admin/fumigators')
@UseGuards(AdminGuard)
export class AdminFumigatorsController {
  constructor(private readonly fumigators: FumigatorsService) {}

  /** Everyone in a country, for pickers (job assignment). */
  @Get()
  list(@Query('country') country?: string) {
    return this.fumigators.list(countryParam(country));
  }

  /** The Fumigators page: ?country=NG&q=…&availability=available&certificate=expired&page=1 */
  @Get('list')
  page(
    @Query('country') country?: string,
    @Query('q') q?: string,
    @Query('availability') availability?: string,
    @Query('certificate') certificate?: string,
    @Query('page') page?: string,
  ) {
    return this.fumigators.page({
      country: countryParam(country),
      q: q?.trim().slice(0, 100) || undefined,
      availability: (availability ?? '').split(',').filter(isAvailability),
      certificate: (certificate ?? '').split(',').filter(isCertificateStatus),
      page: Math.max(
        1,
        Math.min(10_000, Number.parseInt(page ?? '1', 10) || 1),
      ),
    });
  }

  /** Branches, skills and weekdays the forms offer. */
  @Get('options')
  options(@Query('country') country?: string) {
    return {
      branches: BRANCHES[countryParam(country)],
      skills: SKILLS,
      weekdays: WEEKDAYS,
    };
  }

  @Post()
  create(@Body() dto: FumigatorDto) {
    return this.fumigators.create(dto);
  }

  /** ?days=30 sets the performance window. */
  @Get(':id')
  details(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days?: string,
  ) {
    const window = [7, 30, 90, 365].includes(Number(days)) ? Number(days) : 30;
    return this.fumigators.details(id, window);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFumigatorDto,
  ) {
    return this.fumigators.update(id, dto);
  }

  /** Creates (or re-sends) the fumigator's portal login and emails a set-password link. */
  @Post(':id/invite')
  @HttpCode(200)
  invite(@Param('id', ParseUUIDPipe) id: string) {
    return this.fumigators.invite(id);
  }

  @Patch(':id/availability')
  availability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AvailabilityDto,
  ) {
    return this.fumigators.setAvailability(id, dto.availability);
  }

  @Post(':id/certificates')
  @UseInterceptors(documentUpload)
  addCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CertificateDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.fumigators.addCertificate(id, dto, file);
  }

  @Patch(':id/certificates/:certificateId')
  @UseInterceptors(documentUpload)
  updateCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('certificateId', ParseUUIDPipe) certificateId: string,
    @Body() dto: CertificateDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.fumigators.updateCertificate(id, certificateId, dto, file);
  }

  @Delete(':id/certificates/:certificateId')
  removeCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('certificateId', ParseUUIDPipe) certificateId: string,
  ) {
    return this.fumigators.removeCertificate(id, certificateId);
  }

  @Get(':id/certificates/:certificateId/document')
  async document(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('certificateId', ParseUUIDPipe) certificateId: string,
  ) {
    const { document, stream } = await this.fumigators.openDocument(
      id,
      certificateId,
    );
    return new StreamableFile(stream, {
      type: document.mimeType,
      length: document.size,
      disposition: 'inline',
    });
  }
}
