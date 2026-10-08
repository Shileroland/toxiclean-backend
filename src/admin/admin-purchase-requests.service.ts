import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  PAYMENT_METHODS,
  PurchaseRequestContact,
  PurchaseRequestNote,
  PurchaseRequestPayment,
} from '../quote-requests/purchase-request-activity.entity.js';
import {
  QUOTE_STATUSES,
  QuoteRequest,
  type QuoteStatus,
} from '../quote-requests/quote-request.entity.js';
import type { User } from '../users/user.entity.js';
import type { Country } from './admin.service.js';
import type {
  LogContactDto,
  RecordPaymentDto,
} from './dto/admin-purchase-request.dto.js';

export const PAGE_SIZE = 10;

export type ListFilters = {
  country: Country;
  q?: string;
  statuses?: QuoteStatus[];
  page: number;
};

/** Requests that can still be declined: before any payment has been recorded. */
const DECLINABLE: QuoteStatus[] = [
  'requested',
  'contacted',
  'confirmed',
  'payment_pending',
];

const sumItems = (r: QuoteRequest, key: 'unitPrice' | 'agreedUnitPrice') =>
  r.items.every((i) => i[key] !== undefined)
    ? r.items.reduce((sum, i) => sum + (i[key] ?? 0) * i.quantity, 0)
    : null;

/** "08:30" on a YYYY-MM-DD in West Africa Time (UTC+1) as a Date. */
const watDateTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00+01:00`);

@Injectable()
export class AdminPurchaseRequestsService {
  constructor(
    @InjectRepository(QuoteRequest)
    private readonly requests: Repository<QuoteRequest>,
    @InjectRepository(PurchaseRequestPayment)
    private readonly payments: Repository<PurchaseRequestPayment>,
    @InjectRepository(PurchaseRequestContact)
    private readonly contacts: Repository<PurchaseRequestContact>,
    @InjectRepository(PurchaseRequestNote)
    private readonly notes: Repository<PurchaseRequestNote>,
    private readonly config: ConfigService,
  ) {}

  async list({ country, q, statuses, page }: ListFilters) {
    const query = this.requests
      .createQueryBuilder('r')
      .where('r.country = :country', { country })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (statuses?.length)
      query.andWhere('r.status IN (:...statuses)', { statuses });
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query.andWhere(
        new Brackets((w) =>
          w
            .where('r.reference ILIKE :like', { like })
            .orWhere('r.fullName ILIKE :like', { like })
            .orWhere('r.organisationName ILIKE :like', { like })
            .orWhere('r.phone ILIKE :like', { like })
            .orWhere('r.email ILIKE :like', { like }),
        ),
      );
    }
    const [rows, total] = await query.getManyAndCount();
    return {
      items: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        customer: r.organisationName || r.fullName,
        itemCount: r.items.reduce((sum, i) => sum + i.quantity, 0),
        deliveryMethod: r.deliveryMethod,
        source: r.kind === 'bulk' ? 'bulk_quote' : 'direct_request',
        createdAt: r.createdAt,
        status: r.status,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  async get(id: number) {
    const r = await this.requests.findOne({
      where: { id },
      relations: {
        payments: { recordedBy: true },
        contacts: { loggedBy: true },
        internalNotes: true,
        user: true,
      },
      order: {
        payments: { paidOn: 'ASC', createdAt: 'ASC' },
        contacts: { contactedAt: 'DESC' },
        internalNotes: { createdAt: 'DESC' },
      },
    });
    if (!r) throw new NotFoundException('Purchase request not found.');
    const amountPaid = r.payments.reduce((sum, p) => sum + p.amount, 0);
    const { user, payments, contacts, internalNotes, ...rest } = r;
    return {
      ...rest,
      source: r.kind === 'bulk' ? 'bulk_quote' : 'direct_request',
      hasAccount: Boolean(user),
      estimatedTotal: sumItems(r, 'unitPrice'),
      amountPaid,
      balanceDue:
        r.confirmedTotal === null
          ? null
          : Math.max(0, r.confirmedTotal - amountPaid),
      payments: payments.map(
        ({
          id: pid,
          amount,
          method,
          paidOn,
          account,
          recordedBy,
          createdAt,
        }) => ({
          id: pid,
          amount,
          method,
          paidOn,
          account,
          recordedBy: recordedBy?.fullName ?? null,
          createdAt,
        }),
      ),
      contacts: contacts.map(
        ({ id: cid, method, contactedAt, note, loggedBy }) => ({
          id: cid,
          method,
          contactedAt,
          note,
          loggedBy: loggedBy?.fullName ?? null,
        }),
      ),
      internalNotes: internalNotes.map(
        ({ id: nid, body, authorName, createdAt }) => ({
          id: nid,
          body,
          authorName,
          createdAt,
        }),
      ),
    };
  }

  /** Payment methods and the accounts payments can go into, for the Record Payment form. */
  options(country: Country) {
    const raw = this.config.get<string>(`PAYMENT_ACCOUNTS_${country}`) ?? '';
    return {
      paymentMethods: PAYMENT_METHODS,
      accounts: raw
        .split('|')
        .map((a) => a.trim())
        .filter(Boolean),
    };
  }

  private async load(id: number) {
    const r = await this.requests.findOne({
      where: { id },
      relations: { payments: true },
    });
    if (!r) throw new NotFoundException('Purchase request not found.');
    return r;
  }

  private assertStatus(
    r: QuoteRequest,
    allowed: QuoteStatus[],
    action: string,
  ) {
    if (!allowed.includes(r.status)) {
      throw new ConflictException(
        `This request can't be ${action} while it is ${r.status.replace(/_/g, ' ')}.`,
      );
    }
  }

  private async setStatus(
    r: QuoteRequest,
    status: QuoteStatus,
    extra: Partial<QuoteRequest> = {},
  ) {
    await this.requests.update(r.id, { status, ...extra });
    return this.get(r.id);
  }

  /** Logs a call/WhatsApp/email; the first one moves a new request to Contacted. */
  async logContact(id: number, dto: LogContactDto, user: User) {
    const r = await this.load(id);
    await this.contacts.save(
      this.contacts.create({
        request: { id: r.id },
        method: dto.method,
        contactedAt: watDateTime(dto.date, dto.time),
        note: dto.note,
        loggedBy: { id: user.id },
      }),
    );
    if (r.status === 'requested')
      await this.requests.update(r.id, { status: 'contacted' });
    return this.get(r.id);
  }

  /** Saves the prices agreed with the customer and marks the request Confirmed. */
  async confirm(id: number, unitPrices: number[]) {
    const r = await this.load(id);
    this.assertStatus(r, ['requested', 'contacted'], 'confirmed');
    if (unitPrices.length !== r.items.length) {
      throw new BadRequestException(
        'Give an agreed price for every requested item.',
      );
    }
    const items = r.items.map((item, i) => ({
      ...item,
      agreedUnitPrice: unitPrices[i],
    }));
    const confirmedTotal = items.reduce(
      (sum, i) => sum + i.agreedUnitPrice * i.quantity,
      0,
    );
    return this.setStatus(r, 'confirmed', { items, confirmedTotal });
  }

  async decline(id: number, reason: string) {
    const r = await this.load(id);
    this.assertStatus(r, DECLINABLE, 'declined');
    if (r.payments.length > 0) {
      throw new ConflictException(
        'A payment has been recorded for this request, so it can’t be declined.',
      );
    }
    return this.setStatus(r, 'declined', { declineReason: reason });
  }

  async markPaymentPending(id: number) {
    const r = await this.load(id);
    this.assertStatus(r, ['confirmed'], 'marked payment pending');
    return this.setStatus(r, 'payment_pending');
  }

  /** Records a (possibly partial) payment; paying the full balance marks it Payment Received. */
  async recordPayment(id: number, dto: RecordPaymentDto, user: User) {
    const r = await this.load(id);
    this.assertStatus(r, ['confirmed', 'payment_pending'], 'paid');
    const total = r.confirmedTotal ?? 0;
    const paid = r.payments.reduce((sum, p) => sum + p.amount, 0);
    if (dto.amount > total - paid) {
      throw new BadRequestException('The amount is more than the balance due.');
    }
    await this.payments.save(
      this.payments.create({
        request: { id: r.id },
        amount: dto.amount,
        method: dto.method,
        paidOn: dto.paidOn,
        account: dto.account,
        recordedBy: { id: user.id },
      }),
    );
    const status: QuoteStatus =
      paid + dto.amount >= total ? 'payment_received' : 'payment_pending';
    return this.setStatus(r, status);
  }

  async startProcessing(id: number) {
    const r = await this.load(id);
    this.assertStatus(r, ['payment_received'], 'processed');
    return this.setStatus(r, 'processing');
  }

  /** Delivery orders are dispatched; pickup orders become ready for pickup. */
  async fulfil(id: number) {
    const r = await this.load(id);
    this.assertStatus(r, ['processing'], 'fulfilled');
    return this.setStatus(
      r,
      r.deliveryMethod === 'delivery' ? 'dispatched' : 'ready_for_pickup',
    );
  }

  async complete(id: number) {
    const r = await this.load(id);
    this.assertStatus(r, ['dispatched', 'ready_for_pickup'], 'completed');
    return this.setStatus(r, 'completed');
  }

  async addNote(id: number, body: string, user: User) {
    const r = await this.load(id);
    await this.notes.save(
      this.notes.create({
        request: { id: r.id },
        body,
        author: { id: user.id },
        authorName: user.fullName,
      }),
    );
    return this.get(r.id);
  }
}

export const isQuoteStatus = (s: string): s is QuoteStatus =>
  (QUOTE_STATUSES as readonly string[]).includes(s);
