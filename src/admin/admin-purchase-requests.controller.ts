import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, CurrentUser } from '../auth/session.guard.js';
import type { User } from '../users/user.entity.js';
import {
  AdminPurchaseRequestsService,
  isQuoteStatus,
} from './admin-purchase-requests.service.js';
import { countryParam } from './admin.controller.js';
import {
  ConfirmPricesDto,
  DeclineDto,
  LogContactDto,
  NoteDto,
  RecordPaymentDto,
} from './dto/admin-purchase-request.dto.js';

/** Product requests and bulk quotes, from the admin's Purchase Requests page. */
@Controller('admin/purchase-requests')
@UseGuards(AdminGuard)
export class AdminPurchaseRequestsController {
  constructor(private readonly requests: AdminPurchaseRequestsService) {}

  /** ?country=NG&q=…&status=new,contacted&page=1 */
  @Get()
  list(
    @Query('country') country?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.requests.list({
      country: countryParam(country),
      q: q?.trim().slice(0, 100) || undefined,
      statuses: (status ?? '').split(',').filter(isQuoteStatus),
      page: Math.max(
        1,
        Math.min(10_000, Number.parseInt(page ?? '1', 10) || 1),
      ),
    });
  }

  @Get('options')
  options(@Query('country') country?: string) {
    return this.requests.options(countryParam(country));
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.requests.get(id);
  }

  @Post(':id/contacts')
  @HttpCode(200)
  logContact(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LogContactDto,
    @CurrentUser() user: User,
  ) {
    return this.requests.logContact(id, dto, user);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmPricesDto,
  ) {
    return this.requests.confirm(id, dto.unitPrices);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(@Param('id', ParseIntPipe) id: number, @Body() dto: DeclineDto) {
    return this.requests.decline(id, dto.reason);
  }

  @Post(':id/payment-pending')
  @HttpCode(200)
  paymentPending(@Param('id', ParseIntPipe) id: number) {
    return this.requests.markPaymentPending(id);
  }

  @Post(':id/payments')
  @HttpCode(200)
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: User,
  ) {
    return this.requests.recordPayment(id, dto, user);
  }

  @Post(':id/processing')
  @HttpCode(200)
  startProcessing(@Param('id', ParseIntPipe) id: number) {
    return this.requests.startProcessing(id);
  }

  /** Dispatched for delivery orders, Ready for Pickup for pickup orders. */
  @Post(':id/fulfil')
  @HttpCode(200)
  fulfil(@Param('id', ParseIntPipe) id: number) {
    return this.requests.fulfil(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.requests.complete(id);
  }

  @Post(':id/notes')
  @HttpCode(200)
  addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: User,
  ) {
    return this.requests.addNote(id, dto.body, user);
  }
}
