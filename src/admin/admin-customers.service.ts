import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Raw, Repository } from 'typeorm';
import { Booking } from '../bookings/booking.entity.js';
import { type CustomerType, Customer } from '../customers/customer.entity.js';
import {
  CustomersService,
  formatCustomerReference,
} from '../customers/customers.service.js';
import { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import type { Country } from './admin.service.js';

export const PAGE_SIZE = 10;
const RECENT = 3;
const HISTORY_LIMIT = 50;

export type ListFilters = {
  country: Country;
  q?: string;
  types?: CustomerType[];
  page: number;
};

/** One entry in a customer's history, newest first. */
export type HistoryEntry = {
  kind:
    | 'customer_added'
    | 'booking_requested'
    | 'booking_completed'
    | 'request_submitted'
    | 'contact_logged'
    | 'payment_recorded';
  at: Date;
  reference: string | null;
  /** Links to the booking or purchase request the entry is about. */
  bookingId?: number;
  requestId?: number;
  detail: string;
  method?: string;
  amount?: number;
  currency?: string;
  /** The staff member who logged it, when known. */
  by: string | null;
};

const requestTitle = (r: QuoteRequest) => {
  const [first, ...rest] = r.items;
  if (!first) return 'Purchase request';
  return rest.length
    ? `${first.productName} + ${rest.length} more`
    : first.productName;
};

const placeOf = (b: Booking) =>
  [b.address, b.city, b.state].filter(Boolean).join(', ');

@Injectable()
export class AdminCustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
    @InjectRepository(QuoteRequest)
    private readonly requests: Repository<QuoteRequest>,
    private readonly people: CustomersService,
  ) {}

  async list({ country, q, types, page }: ListFilters) {
    const query = this.customers
      .createQueryBuilder('c')
      .where('c.country = :country', { country })
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (types?.length) query.andWhere('c.type IN (:...types)', { types });
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query.andWhere(
        new Brackets((w) =>
          w
            .where('c.name ILIKE :like', { like })
            .orWhere('c.phone ILIKE :like', { like })
            .orWhere('c.email ILIKE :like', { like }),
        ),
      );
    }
    const [rows, total] = await query.getManyAndCount();
    // Counted the same way the details panel lists them (own + account, duplicates once).
    const counts = await Promise.all(
      rows.map((c) => this.people.listLocations(c.id).then((l) => l.length)),
    );
    return {
      items: rows.map((c, i) => ({
        id: c.id,
        reference: formatCustomerReference(c.number),
        type: c.type,
        name: c.name,
        phone: c.phone,
        email: c.email,
        country: c.country,
        locationCount: counts[i],
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  async get(id: string) {
    const customer = await this.people.get(id);
    const [locations, bookings, requests] = await Promise.all([
      this.people.listLocations(id),
      this.bookingsOf(customer),
      this.requestsOf(customer),
    ]);
    const { user, number, ...rest } = customer;
    return {
      ...rest,
      reference: formatCustomerReference(number),
      hasAccount: Boolean(user),
      language: user?.language ?? null,
      locations,
      recentRequests: requests.slice(0, RECENT).map((r) => ({
        id: r.id,
        reference: r.reference,
        title: requestTitle(r),
        status: r.status,
        createdAt: r.createdAt,
      })),
      recentBookings: bookings.slice(0, RECENT).map((b) => ({
        id: b.id,
        reference: b.reference,
        serviceName: b.serviceName,
        place: placeOf(b),
        date: b.scheduledDate ?? b.preferredDate,
        status: b.status,
      })),
      history: this.history(customer, bookings, requests),
    };
  }

  /** Bookings linked to the customer, plus unlinked website bookings with their email. */
  private bookingsOf(customer: Customer) {
    return this.bookings
      .createQueryBuilder('b')
      .where('b.customerId = :id', { id: customer.id })
      .orWhere('(b.customerId IS NULL AND LOWER(b.email) = :email)', {
        email: customer.email,
      })
      .orderBy('b.createdAt', 'DESC')
      .take(HISTORY_LIMIT)
      .getMany();
  }

  private requestsOf(customer: Customer) {
    return this.requests.find({
      where: {
        email: Raw((column) => `LOWER(${column}) = :email`, {
          email: customer.email,
        }),
      },
      relations: {
        contacts: { loggedBy: true },
        payments: { recordedBy: true },
      },
      order: { createdAt: 'DESC' },
      take: HISTORY_LIMIT,
    });
  }

  private history(
    customer: Customer,
    bookings: Booking[],
    requests: QuoteRequest[],
  ): HistoryEntry[] {
    const entries: HistoryEntry[] = [
      {
        kind: 'customer_added',
        at: customer.createdAt,
        reference: formatCustomerReference(customer.number),
        detail: `${customer.name} was added as a customer.`,
        by: null,
      },
    ];
    for (const b of bookings) {
      const base = { reference: b.reference, bookingId: b.id, by: null };
      entries.push({
        ...base,
        kind: 'booking_requested',
        at: b.createdAt,
        detail: `${b.serviceName} at ${placeOf(b)}.`,
      });
      if (b.completedAt) {
        entries.push({
          ...base,
          kind: 'booking_completed',
          at: b.completedAt,
          detail: `${b.serviceName} completed at ${placeOf(b)}.`,
        });
      }
    }
    for (const r of requests) {
      const base = { reference: r.reference, requestId: r.id };
      entries.push({
        ...base,
        kind: 'request_submitted',
        at: r.createdAt,
        detail: `${requestTitle(r)} requested.`,
        by: null,
      });
      for (const c of r.contacts) {
        entries.push({
          ...base,
          kind: 'contact_logged',
          at: c.contactedAt,
          detail: c.note,
          method: c.method,
          by: c.loggedBy?.fullName ?? null,
        });
      }
      for (const p of r.payments) {
        entries.push({
          ...base,
          kind: 'payment_recorded',
          at: p.createdAt,
          detail: `Payment received by ${p.method.replace('_', ' ')} into ${p.account}.`,
          method: p.method,
          amount: p.amount,
          currency: r.currency,
          by: p.recordedBy?.fullName ?? null,
        });
      }
    }
    return entries
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, HISTORY_LIMIT);
  }
}
