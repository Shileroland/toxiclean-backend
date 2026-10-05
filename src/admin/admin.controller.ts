import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/session.guard.js';
import { COUNTRIES } from '../quote-requests/quote-request.entity.js';
import { AdminService, type Country } from './admin.service.js';

/** `?country=` for admin pages: NG or BJ, defaulting to Nigeria. */
export function countryParam(country?: string): Country {
  return COUNTRIES.includes(country as Country) ? (country as Country) : 'NG';
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Dashboard numbers and recent activity for one country (default Nigeria). */
  @Get('overview')
  overview(@Query('country') country?: string) {
    return this.admin.overview(countryParam(country));
  }
}
