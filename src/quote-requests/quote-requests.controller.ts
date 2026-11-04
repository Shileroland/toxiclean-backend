import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  CurrentUser,
  OptionalSessionGuard,
  SessionGuard,
} from '../auth/session.guard.js';
import { languageFrom } from '../mail/language.js';
import type { User } from '../users/user.entity.js';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto.js';
import { QuoteRequestsService } from './quote-requests.service.js';

@Controller('quote-requests')
export class QuoteRequestsController {
  constructor(private readonly quoteRequests: QuoteRequestsService) {}

  /** Anyone can request a quote; it's linked to the account when signed in. */
  @Post()
  @UseGuards(ThrottlerGuard, OptionalSessionGuard)
  // Each request emails the address given, so limit how fast one client can send them.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @Body() dto: CreateQuoteRequestDto,
    @CurrentUser() user?: User,
    @Headers('accept-language') language?: string,
  ) {
    return this.quoteRequests.create(dto, user?.id, languageFrom(language));
  }

  @Get('mine')
  @UseGuards(SessionGuard)
  mine(@CurrentUser() user: User) {
    return this.quoteRequests.listForUser(user.id);
  }
}
