import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/session.guard.js';
import { CustomerDto, LocationDto } from '../customers/customer.dto.js';
import { CustomersService } from '../customers/customers.service.js';
import {
  FumigatorDto,
  UpdateFumigatorDto,
} from '../fumigators/fumigator.dto.js';
import { FumigatorsService } from '../fumigators/fumigators.service.js';
import { countryParam } from './admin.controller.js';

@Controller('admin/customers')
@UseGuards(AdminGuard)
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** Up to 10 customers matching `q` (name, phone or email). */
  @Get()
  search(@Query('country') country?: string, @Query('q') q?: string) {
    return this.customers.search(countryParam(country), q);
  }

  @Post()
  create(@Body() dto: CustomerDto) {
    return this.customers.create(dto);
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
}

@Controller('admin/fumigators')
@UseGuards(AdminGuard)
export class AdminFumigatorsController {
  constructor(private readonly fumigators: FumigatorsService) {}

  @Get()
  list(@Query('country') country?: string) {
    return this.fumigators.list(countryParam(country));
  }

  @Post()
  create(@Body() dto: FumigatorDto) {
    return this.fumigators.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFumigatorDto,
  ) {
    return this.fumigators.update(id, dto);
  }
}
