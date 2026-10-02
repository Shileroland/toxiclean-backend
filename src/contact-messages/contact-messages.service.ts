import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import type { Language } from '../users/user.entity.js';
import { ContactMessage } from './contact-message.entity.js';
import { CreateContactMessageDto } from './dto/create-contact-message.dto.js';

@Injectable()
export class ContactMessagesService {
  constructor(
    @InjectRepository(ContactMessage)
    private readonly messages: Repository<ContactMessage>,
    private readonly mail: MailService,
  ) {}

  async create(dto: CreateContactMessageDto, language: Language = 'en') {
    const saved = await this.messages.save(
      this.messages.create({
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        email: dto.email.trim().toLowerCase(),
        country: dto.country,
        topic: dto.topic,
        preferredContactMethod: dto.preferredContactMethod,
        message: dto.message.trim(),
      }),
    );
    // Sent in the background so a slow email provider doesn't hold up the response.
    void this.mail.contactMessageReceived(saved, language);
  }
}
