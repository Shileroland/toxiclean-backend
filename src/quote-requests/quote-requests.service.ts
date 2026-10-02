import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import type { Language } from '../users/user.entity.js';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto.js';
import { QuoteRequest } from './quote-request.entity.js';

export function formatReference(id: number) {
  return `TX-PR-${String(id).padStart(6, '0')}`;
}

@Injectable()
export class QuoteRequestsService {
  constructor(
    @InjectRepository(QuoteRequest)
    private readonly quoteRequests: Repository<QuoteRequest>,
    private readonly mail: MailService,
  ) {}

  async create(
    dto: CreateQuoteRequestDto,
    userId?: string,
    language: Language = 'en',
  ) {
    const isDelivery = dto.deliveryMethod === 'delivery';
    const saved = await this.quoteRequests.save(
      this.quoteRequests.create({
        kind: dto.kind ?? 'bulk',
        currency: dto.currency ?? 'NGN',
        items: dto.items,
        organisationName: dto.organisationName?.trim() || null,
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        email: dto.email.trim().toLowerCase(),
        country: dto.country,
        deliveryMethod: dto.deliveryMethod,
        // Address fields only apply to delivery.
        state: isDelivery ? (dto.state ?? null) : null,
        city: isDelivery ? (dto.city ?? null) : null,
        address: isDelivery ? (dto.address ?? null) : null,
        tenderReference: dto.tenderReference?.trim() || null,
        preferredContactMethod: dto.preferredContactMethod,
        notes: dto.notes?.trim() || null,
        user: userId ? { id: userId } : null,
      }),
    );

    const reference = formatReference(saved.id);
    await this.quoteRequests.update(saved.id, { reference });
    // Sent in the background so a slow email provider doesn't hold up the response.
    saved.reference = reference;
    void this.mail.quoteRequestReceived(saved, language, Boolean(userId));
    return { reference };
  }

  /** The signed-in user's own quote requests, newest first. */
  async listForUser(userId: string) {
    const rows = await this.quoteRequests.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
    return rows.map(({ user: _user, ...request }) => request);
  }
}
