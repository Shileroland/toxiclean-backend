import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../catalog/catalog.entity.js';
import { MailService } from '../mail/mail.service.js';
import type { Language } from '../users/user.entity.js';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto.js';
import { QuoteRequest, type QuoteRequestItem } from './quote-request.entity.js';
import { LeadsService } from '../leads/leads.service.js';

export function formatReference(id: number) {
  return `TX-PR-${String(id).padStart(6, '0')}`;
}

@Injectable()
export class QuoteRequestsService {
  constructor(
    @InjectRepository(QuoteRequest)
    private readonly quoteRequests: Repository<QuoteRequest>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly mail: MailService,
    private readonly leads: LeadsService,
  ) {}

  async create(
    dto: CreateQuoteRequestDto,
    userId?: string,
    language: Language = 'en',
  ) {
    const isDelivery = dto.deliveryMethod === 'delivery';
    const kind = dto.kind ?? 'bulk';
    const currency = dto.currency ?? 'NGN';
    const items = await this.catalogItems(dto.items, kind, currency);
    const saved = await this.quoteRequests.save(
      this.quoteRequests.create({
        kind,
        currency,
        items,
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
        language,
        user: userId ? { id: userId } : null,
      }),
    );

    const reference = formatReference(saved.id);
    await this.quoteRequests.update(saved.id, { reference });
    // Sent in the background so a slow email provider doesn't hold up the response.
    saved.reference = reference;
    // Bulk quotes are followed up as leads; product requests go straight to Purchase Requests.
    if (saved.kind === 'bulk') await this.leads.forQuoteRequest(saved);
    void this.mail.quoteRequestReceived(saved, language, Boolean(userId));
    return { reference };
  }

  /**
   * Checks the items against the catalog and takes each name and estimated price from
   * it, so the request shows what the shop showed rather than what the browser sent.
   */
  private async catalogItems(
    items: CreateQuoteRequestDto['items'],
    kind: QuoteRequest['kind'],
    currency: QuoteRequest['currency'],
  ): Promise<QuoteRequestItem[]> {
    const slugs = [...new Set(items.map((i) => i.productSlug))];
    const products = await this.products.find({ where: { slug: In(slugs) } });
    return items.map((item) => {
      const product = products.find((p) => p.slug === item.productSlug);
      if (!product) {
        throw new BadRequestException(
          'One of the products is no longer available.',
        );
      }
      const price = currency === 'NGN' ? product.priceNgn : product.priceXof;
      return {
        productSlug: product.slug,
        productName: product.name,
        quantity: item.quantity,
        ...(kind === 'product' && price !== null && { unitPrice: price }),
      };
    });
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
