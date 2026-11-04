import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type DeepPartial, Repository } from 'typeorm';
import type { Booking } from '../bookings/booking.entity.js';
import type { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import { Lead, type LeadSource } from './lead.entity.js';

export function formatLeadReference(id: number) {
  return `TX-LD-${String(id).padStart(6, '0')}`;
}

/** Opens a lead for each website enquiry (service booking request or bulk quote). */
@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
  ) {}

  forBooking(booking: Booking) {
    return this.open('service_booking', booking.country as 'NG' | 'BJ', {
      booking: { id: booking.id },
    });
  }

  forQuoteRequest(request: QuoteRequest) {
    return this.open('bulk_quote', request.country, {
      quoteRequest: { id: request.id },
    });
  }

  private async open(
    source: LeadSource,
    country: 'NG' | 'BJ',
    link: Pick<DeepPartial<Lead>, 'booking' | 'quoteRequest'>,
  ) {
    const saved = await this.leads.save(
      this.leads.create({
        source,
        country,
        booking: link.booking,
        quoteRequest: link.quoteRequest,
      }),
    );
    saved.reference = formatLeadReference(saved.id);
    await this.leads.update(saved.id, { reference: saved.reference });
    return saved;
  }
}
