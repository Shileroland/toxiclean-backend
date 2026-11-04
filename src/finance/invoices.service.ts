import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import {
  Brackets,
  type DeepPartial,
  In,
  QueryFailedError,
  Raw,
  Repository,
} from 'typeorm';
import { todayInWat } from '../bookings/bookings.service.js';
import { Product } from '../catalog/catalog.entity.js';
import { Customer } from '../customers/customer.entity.js';
import { BRANCHES } from '../fumigators/fumigator.entity.js';
import type { Lead } from '../leads/lead.entity.js';
import { bankDetails } from '../proformas/bank-details.js';
import type { Proforma } from '../proformas/proforma.entity.js';
import { DEFAULT_TAX_PERCENT } from '../proformas/rate-card.js';
import type { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import type { Language, User } from '../users/user.entity.js';
import { AccountsService, checkBranch, PAGE_SIZE } from './accounts.service.js';
import type {
  InvoiceDto,
  InvoiceNotesDto,
  InvoicePaymentDto,
} from './finance.dto.js';
import {
  type FinanceCountry,
  Income,
  type IncomeSource,
  Invoice,
  type InvoiceItem,
  type InvoiceSource,
} from './finance.entity.js';
import { IncomeService } from './income.service.js';
import { escapeLike } from './periods.js';

export const INVOICE_STATUSES = [
  'paid',
  'partial',
  'unpaid',
  'overdue',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function invoiceStatus(
  total: number,
  paid: number,
  dueDate: string,
  today = todayInWat(),
): InvoiceStatus {
  if (paid >= total) return 'paid';
  if (dueDate < today) return 'overdue';
  return paid > 0 ? 'partial' : 'unpaid';
}

/** Line amounts, subtotal, tax and total (whole currency units). */
export function invoiceTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number,
) {
  const subtotal = items.reduce(
    (n, i) => n + Math.round(i.quantity * i.unitPrice),
    0,
  );
  const tax = Math.round((subtotal * taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

const PAID = `(SELECT COALESCE(SUM(p.amount), 0) FROM incomes p WHERE p."invoiceId" = v.id)`;

/** Which income source an invoice's payments count towards. */
const incomeSource: Record<InvoiceSource, IncomeSource> = {
  manual: 'other',
  service_booking: 'services',
  product_purchase: 'product_sales',
};

/** Days a customer has to pay an invoice the system created. */
export const AUTO_INVOICE_DUE_DAYS = 7;

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const countryLanguage = (country: FinanceCountry): Language =>
  country === 'BJ' ? 'fr' : 'en';

const newShareToken = () => randomBytes(24).toString('base64url');

/** TCL-INV-2026-0001: numbered from 1 each year. */
export const invoiceReference = (year: string, n: number) =>
  `TCL-INV-${year}-${String(n).padStart(4, '0')}`;

const isUniqueViolation = (err: unknown) =>
  err instanceof QueryFailedError &&
  (err.driverError as { code?: string }).code === '23505';

const longDate = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`));

/** The standard Terms & Notes a new invoice starts with, one per line. */
export function defaultInvoiceNotes(
  language: Language,
  dueDate: string,
  deliveryInvoicedSeparately: boolean,
) {
  const due = longDate(dueDate, language);
  const lines =
    language === 'fr'
      ? [
          `Paiement : Merci de régler le solde avant le ${due}, en indiquant le numéro de facture comme référence de paiement.`,
          deliveryInvoicedSeparately &&
            'Livraison : Non incluse dans cette facture. Une fois votre adresse de livraison confirmée, nous vous enverrons une facture séparée pour les frais de livraison.',
        ]
      : [
          `Payment: Please pay the balance by ${due}, using the invoice number as your payment reference.`,
          deliveryInvoicedSeparately &&
            'Delivery: Not included in this invoice. Once you confirm your preferred delivery address, we will issue a separate invoice for the delivery cost.',
        ];
  return lines.filter(Boolean).join('\n');
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Income) private readonly incomes: Repository<Income>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly accounts: AccountsService,
    private readonly income: IncomeService,
    private readonly config: ConfigService,
  ) {}

  async page({
    country,
    q,
    statuses,
    sending,
    page,
  }: {
    country: FinanceCountry;
    q?: string;
    statuses?: InvoiceStatus[];
    sending?: ('sent' | 'not_sent')[];
    page: number;
  }) {
    const today = todayInWat();
    const query = this.invoices
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.booking', 'b')
      .leftJoinAndSelect('v.quoteRequest', 'r')
      .addSelect(PAID, 'paid')
      .where('v.country = :country', { country })
      .orderBy('v.issueDate', 'DESC')
      .addOrderBy('v.number', 'DESC')
      // Only many-to-one joins, so rows and invoices line up for the raw `paid`.
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);
    if (q) {
      query.andWhere(
        new Brackets((w) =>
          w
            .where('v.reference ILIKE :like')
            .orWhere('v.customerName ILIKE :like')
            .orWhere('b.reference ILIKE :like')
            .orWhere('r.reference ILIKE :like')
            .orWhere('v.billingReference ILIKE :like'),
        ),
        { like: escapeLike(q) },
      );
    }
    if (statuses?.length) {
      const conditions: Record<InvoiceStatus, string> = {
        paid: `${PAID} >= v.total`,
        overdue: `${PAID} < v.total AND v."dueDate" < :today`,
        partial: `${PAID} > 0 AND ${PAID} < v.total AND v."dueDate" >= :today`,
        unpaid: `${PAID} = 0 AND v."dueDate" >= :today`,
      };
      query.andWhere(
        new Brackets((w) => {
          for (const s of statuses) w.orWhere(conditions[s], { today });
        }),
      );
    }
    if (sending?.length === 1) {
      query.andWhere(
        sending[0] === 'sent' ? 'v."sentAt" IS NOT NULL' : 'v."sentAt" IS NULL',
      );
    }
    const { entities, raw } = await query.getRawAndEntities<{ paid: string }>();
    const total = await query.getCount();
    return {
      items: entities.map((v, i) => {
        const paid = Number(raw[i]?.paid ?? 0);
        return {
          id: v.id,
          reference: v.reference,
          customer: v.customerName,
          source: v.source,
          issueDate: v.issueDate,
          dueDate: v.dueDate,
          total: v.total,
          balance: Math.max(0, v.total - paid),
          status: invoiceStatus(v.total, paid, v.dueDate, today),
          sent: Boolean(v.sentAt),
        };
      }),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  private async find(id: string) {
    const v = await this.invoices.findOne({
      where: { id },
      relations: {
        booking: true,
        quoteRequest: true,
        proforma: true,
        customer: true,
        recordedBy: true,
        payments: { account: true },
      },
      order: { payments: { date: 'ASC', createdAt: 'ASC' } },
    });
    if (!v) throw new NotFoundException('Invoice not found.');
    return v;
  }

  async details(id: string) {
    const v = await this.find(id);
    const paid = v.payments.reduce((n, p) => n + p.amount, 0);
    return {
      id: v.id,
      reference: v.reference,
      country: v.country,
      branch: v.branch,
      issueDate: v.issueDate,
      dueDate: v.dueDate,
      billingReference: v.billingReference,
      status: invoiceStatus(v.total, paid, v.dueDate),
      sentAt: v.sentAt,
      shareToken: v.shareToken,
      notes: v.notes,
      deliveryInvoicedSeparately: v.deliveryInvoicedSeparately,
      customer: {
        id: v.customer?.id ?? null,
        name: v.customerName,
        attention: v.attention,
        email: v.customerEmail,
        phone: v.customerPhone,
        address: v.billingAddress,
      },
      items: v.items,
      subtotal: v.subtotal,
      taxRate: v.taxRate,
      tax: v.tax,
      total: v.total,
      paid,
      balance: Math.max(0, v.total - paid),
      source: v.source,
      language: v.language,
      booking: v.booking && {
        id: v.booking.id,
        reference: v.booking.reference,
      },
      quoteRequest: v.quoteRequest && {
        id: v.quoteRequest.id,
        reference: v.quoteRequest.reference,
      },
      proforma: v.proforma && {
        id: v.proforma.id,
        reference: v.proforma.reference,
      },
      payments: v.payments.map((p) => ({
        id: p.id,
        reference: p.reference,
        date: p.date,
        amount: p.amount,
        method: p.method,
        account: p.account?.name ?? p.accountName,
      })),
      recordedBy: v.recordedBy?.fullName ?? 'System',
      createdAt: v.createdAt,
    };
  }

  /** The tax rate a new invoice uses in each country. */
  defaults(country: FinanceCountry) {
    return { taxRate: DEFAULT_TAX_PERCENT[country] };
  }

  async create(dto: InvoiceDto, user: User) {
    checkBranch(dto.country, dto.branch);
    if (dto.dueDate < dto.issueDate) {
      throw new BadRequestException(
        'The due date must be on or after the issue date.',
      );
    }
    const customer = await this.customers.findOne({
      where: { id: dto.customerId },
      relations: { locations: true },
    });
    if (!customer) throw new NotFoundException('Customer not found.');
    if (customer.country !== dto.country) {
      throw new BadRequestException('Choose a customer in the same country.');
    }
    const taxRate = dto.applyTax ? DEFAULT_TAX_PERCENT[dto.country] : 0;
    const items = dto.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit || null,
      unitPrice: i.unitPrice,
    }));
    const firstLocation = customer.locations?.[0];
    const language = dto.language ?? countryLanguage(dto.country);
    const delivery = Boolean(dto.deliveryInvoicedSeparately);
    const saved = await this.save({
      country: dto.country,
      branch: dto.branch,
      customer,
      customerName: customer.name,
      customerEmail: customer.email || null,
      customerPhone: customer.phone || null,
      billingAddress:
        dto.billingAddress ||
        (firstLocation
          ? [firstLocation.address, firstLocation.city, firstLocation.state]
              .filter(Boolean)
              .join(', ')
          : ''),
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      billingReference: dto.billingReference || null,
      items,
      taxRate,
      ...invoiceTotals(items, taxRate),
      source: 'manual',
      language,
      attention: dto.attention || null,
      deliveryInvoicedSeparately: delivery,
      notes:
        dto.notes?.trim() ??
        defaultInvoiceNotes(language, dto.dueDate, delivery),
      recordedBy: user,
    });
    return this.details(saved.id);
  }

  /** Saves a new invoice with the next TCL-INV- number for its year. */
  private async save(fields: DeepPartial<Invoice>) {
    const invoice = this.invoices.create(fields);
    invoice.shareToken = newShareToken();
    const year = invoice.issueDate.slice(0, 4);
    const prefix = invoiceReference(year, 0).slice(0, -4);
    // Two invoices saved at once can pick the same number; the later one retries.
    for (let attempt = 1; ; attempt++) {
      const [{ last }] = await this.invoices.query<{ last: number }[]>(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM $2::int) AS int)), 0) AS last
         FROM invoices WHERE reference LIKE $1`,
        [`${prefix}%`, prefix.length + 1],
      );
      invoice.reference = invoiceReference(year, Number(last) + 1);
      try {
        return await this.invoices.save(invoice);
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 5) throw err;
      }
    }
  }

  /** Edit Terms & Notes (and the delivery line) on any invoice. */
  async updateNotes(id: string, dto: InvoiceNotesDto) {
    await this.find(id);
    await this.invoices.update(id, {
      notes: dto.notes.trim(),
      ...(dto.deliveryInvoicedSeparately !== undefined && {
        deliveryInvoicedSeparately: dto.deliveryInvoicedSeparately,
      }),
    });
    return this.details(id);
  }

  /** The customer record with this email in the country, if there is one. */
  private customerByEmail(country: FinanceCountry, email?: string | null) {
    if (!email) return Promise.resolve(null);
    return this.customers.findOne({
      where: {
        country,
        email: Raw((column) => `LOWER(${column}) = :email`, {
          email: email.trim().toLowerCase(),
        }),
      },
    });
  }

  /** The invoice the system created for a purchase request or proforma. */
  linkedTo(link: { quoteRequestId: number } | { proformaId: number }) {
    return this.invoices.findOne({
      where:
        'quoteRequestId' in link
          ? { quoteRequest: { id: link.quoteRequestId } }
          : { proforma: { id: link.proformaId } },
    });
  }

  /**
   * A confirmed purchase request is invoiced at the agreed prices (they're final, so
   * no tax is added). Payments recorded on the request count towards it.
   */
  async forPurchaseRequest(
    r: Pick<
      QuoteRequest,
      | 'id'
      | 'reference'
      | 'country'
      | 'items'
      | 'organisationName'
      | 'fullName'
      | 'email'
      | 'phone'
      | 'address'
      | 'city'
      | 'state'
      | 'tenderReference'
      | 'language'
      | 'deliveryMethod'
    >,
  ) {
    const existing = await this.linkedTo({ quoteRequestId: r.id });
    if (existing) return existing;
    // French invoices use the products' French names where the admin gave one.
    const french =
      r.language === 'fr'
        ? await this.products.find({
            where: { slug: In(r.items.map((i) => i.productSlug)) },
          })
        : [];
    const items: InvoiceItem[] = r.items.map((i) => ({
      description:
        french.find((p) => p.slug === i.productSlug)?.nameFr || i.productName,
      quantity: i.quantity,
      unit: null,
      unitPrice: i.agreedUnitPrice ?? i.unitPrice ?? 0,
    }));
    const today = todayInWat();
    const dueDate = addDays(today, AUTO_INVOICE_DUE_DAYS);
    const delivery = r.deliveryMethod === 'delivery';
    return this.save({
      country: r.country,
      branch: BRANCHES[r.country][0],
      customer: await this.customerByEmail(r.country, r.email),
      customerName: r.organisationName ?? r.fullName,
      attention: r.organisationName ? r.fullName : null,
      customerEmail: r.email || null,
      customerPhone: r.phone || null,
      billingAddress: [r.address, r.city, r.state].filter(Boolean).join(', '),
      issueDate: today,
      dueDate,
      billingReference: r.tenderReference || r.reference,
      items,
      taxRate: 0,
      ...invoiceTotals(items, 0),
      source: 'product_purchase',
      language: r.language,
      deliveryInvoicedSeparately: delivery,
      notes: defaultInvoiceNotes(r.language, dueDate, delivery),
      quoteRequest: { id: r.id },
      recordedBy: null,
    });
  }

  /**
   * An accepted proforma is invoiced for its total, with its lines, discount and tax.
   * Payments recorded on the proforma count towards it.
   */
  async forProforma(p: Proforma, lead: Pick<Lead, 'source' | 'booking'>) {
    const existing = await this.linkedTo({ proformaId: p.id });
    if (existing) return existing;
    const items: InvoiceItem[] = p.lines.map((l) => ({
      description: l.detail ? `${l.description} (${l.detail})` : l.description,
      quantity: l.quantity,
      unit: l.unit === 'm2' ? 'm²' : null,
      unitPrice: l.unitRate,
    }));
    if (p.discountAmount > 0) {
      items.push({
        description: `Discount (${p.discountPercent}%)`,
        quantity: 1,
        unit: null,
        unitPrice: -p.discountAmount,
      });
    }
    const today = todayInWat();
    const dueDate = addDays(today, AUTO_INVOICE_DUE_DAYS);
    const delivery = p.fulfilment?.method === 'delivery';
    return this.save({
      country: p.country,
      branch: BRANCHES[p.country][0],
      customer: await this.customerByEmail(p.country, p.customer.email),
      customerName: p.customer.name,
      customerEmail: p.customer.email || null,
      customerPhone: p.customer.phone || null,
      billingAddress: p.customer.billingAddress || p.customer.address || '',
      issueDate: today,
      dueDate,
      billingReference: p.reference,
      items,
      subtotal: p.subtotal - p.discountAmount,
      taxRate: p.taxPercent,
      tax: p.taxAmount,
      total: p.total,
      source:
        lead.source === 'bulk_quote' ? 'product_purchase' : 'service_booking',
      language: p.language,
      deliveryInvoicedSeparately: delivery,
      notes: defaultInvoiceNotes(p.language, dueDate, delivery),
      proforma: { id: p.id },
      booking: lead.booking ? { id: lead.booking.id } : null,
      recordedBy: null,
    });
  }

  /** A declined purchase request's invoice goes, unless something was paid on it. */
  async removeUnpaidFor(quoteRequestId: number) {
    const v = await this.linkedTo({ quoteRequestId });
    if (!v) return;
    const paid = await this.incomes.count({ where: { invoice: { id: v.id } } });
    if (!paid) await this.invoices.delete(v.id);
  }

  /** Mark as Sent, once staff have shared the invoice with the customer. */
  async markSent(id: string) {
    const v = await this.find(id);
    if (!v.sentAt) await this.invoices.update(id, { sentAt: new Date() });
    return this.details(id);
  }

  /** Record Payment: income linked to the invoice. */
  async recordPayment(id: string, dto: InvoicePaymentDto, user: User) {
    const v = await this.find(id);
    if (v.quoteRequest || v.proforma) {
      throw new ConflictException(
        v.quoteRequest
          ? 'Record payments for this invoice on its purchase request.'
          : 'Record payments for this invoice on its proforma.',
      );
    }
    const paid = v.payments.reduce((n, p) => n + p.amount, 0);
    if (paid >= v.total)
      throw new ConflictException('This invoice is already paid.');
    if (dto.amount > v.total - paid) {
      throw new BadRequestException('The amount is more than the balance due.');
    }
    if (dto.date > todayInWat()) {
      throw new BadRequestException('The payment date can’t be in the future.');
    }
    const account = await this.accounts.usable(dto.accountId, v.country);
    await this.income.record({
      country: v.country,
      branch: v.branch,
      source: incomeSource[v.source],
      receivedFrom: v.customerName,
      description: `Payment for ${v.reference}`,
      amount: dto.amount,
      date: dto.date,
      method: dto.method,
      account,
      paymentReference: dto.paymentReference,
      invoice: v,
      quoteRequest: v.quoteRequest,
      proforma: v.proforma,
      recordedBy: user,
    });
    return this.details(id);
  }

  private async document(v: Invoice) {
    const paid = (
      await this.incomes.find({ where: { invoice: { id: v.id } } })
    ).reduce((n, p) => n + p.amount, 0);
    return {
      reference: v.reference,
      country: v.country,
      language: v.language,
      currency: v.country === 'NG' ? 'NGN' : 'XOF',
      issueDate: v.issueDate,
      dueDate: v.dueDate,
      billingReference: v.billingReference,
      notes: v.notes,
      deliveryInvoicedSeparately: v.deliveryInvoicedSeparately,
      customer: {
        name: v.customerName,
        attention: v.attention,
        email: v.customerEmail,
        phone: v.customerPhone,
        address: v.billingAddress,
      },
      items: v.items,
      subtotal: v.subtotal,
      taxRate: v.taxRate,
      tax: v.tax,
      total: v.total,
      paid,
      balance: Math.max(0, v.total - paid),
      status: invoiceStatus(v.total, paid, v.dueDate),
      bank: bankDetails(this.config.get<string>(`BANK_DETAILS_${v.country}`)),
    };
  }

  async documentFor(id: string) {
    return this.document(await this.find(id));
  }

  /** The customer's view, from the link they were sent. */
  async shared(token: string) {
    const v = await this.invoices.findOne({ where: { shareToken: token } });
    if (!v) throw new NotFoundException('Invoice not found.');
    return this.document(v);
  }
}
