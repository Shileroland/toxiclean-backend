import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { languageFrom } from '../mail/language.js';
import { ContactMessagesService } from './contact-messages.service.js';
import { CreateContactMessageDto } from './dto/create-contact-message.dto.js';

@Controller('contact-messages')
@UseGuards(ThrottlerGuard)
export class ContactMessagesController {
  constructor(private readonly contactMessages: ContactMessagesService) {}

  /** Public "send us a message" form. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @Body() dto: CreateContactMessageDto,
    @Headers('accept-language') language?: string,
  ) {
    return this.contactMessages.create(dto, languageFrom(language));
  }
}
