import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AdminGuard, CurrentUser } from '../auth/session.guard.js';
import type { User } from '../users/user.entity.js';
import { AdminProformasService } from './admin-proformas.service.js';
import { CustomerResponseDto, ProformaDto } from './dto/admin-proforma.dto.js';
import { RecordPaymentDto } from './dto/admin-purchase-request.dto.js';

/** Proformas (quotations) prepared for leads. */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminProformasController {
  constructor(private readonly proformas: AdminProformasService) {}

  /** The customer, measurements and rates a new proforma starts from. */
  @Get('leads/:id/proforma-defaults')
  defaults(@Param('id', ParseIntPipe) id: number) {
    return this.proformas.defaults(id);
  }

  @Post('leads/:id/proformas')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProformaDto,
    @CurrentUser() user: User,
  ) {
    return this.proformas.create(id, dto, user);
  }

  @Get('proformas/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.proformas.get(id);
  }

  @Patch('proformas/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ProformaDto) {
    return this.proformas.update(id, dto);
  }

  @Get('proformas/:id/document')
  document(@Param('id', ParseIntPipe) id: number) {
    return this.proformas.documentFor(id);
  }

  @Post('proformas/:id/sent')
  @HttpCode(200)
  markSent(@Param('id', ParseIntPipe) id: number) {
    return this.proformas.markSent(id);
  }

  @Post('proformas/:id/response')
  @HttpCode(200)
  recordResponse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CustomerResponseDto,
  ) {
    return this.proformas.recordResponse(id, dto);
  }

  /** Rev. 2, 3…: replaces the shared proforma with an updated one. */
  @Post('proformas/:id/revisions')
  revise(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProformaDto,
    @CurrentUser() user: User,
  ) {
    return this.proformas.revise(id, dto, user);
  }

  @Post('proformas/:id/payments')
  @HttpCode(200)
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: User,
  ) {
    return this.proformas.recordPayment(id, dto, user);
  }
}

/** The proforma a customer opens from the link they were sent; the token is the key. */
@Controller('proformas')
@UseGuards(ThrottlerGuard)
export class SharedProformasController {
  constructor(private readonly proformas: AdminProformasService) {}

  @Get('shared/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  shared(@Param('token') token: string) {
    if (!/^[\w-]{20,64}$/.test(token)) {
      throw new NotFoundException('Proforma not found.');
    }
    return this.proformas.shared(token);
  }
}
