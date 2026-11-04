import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { bankDetails } from '../proformas/bank-details.js';
import { IncomeService } from '../finance/income.service.js';
import { InvoicesService } from '../finance/invoices.service.js';
import { Not, Repository } from 'typeorm';
import { todayInWat } from '../bookings/bookings.service.js';
import { Lead, OPEN_LEAD_STATUSES } from '../leads/lead.entity.js';
import { priceProforma } from '../proformas/pricing.js';
import {
  type ProformaTreatment,
  Proforma,
  ProformaPayment,
} from '../proformas/proforma.entity.js';
import {
  DEFAULT_DEPOSIT_PERCENT,
  DEFAULT_TAX_PERCENT,
  DEFAULT_UPFRONT_DISCOUNT_PERCENT,
  QUOTE_VALIDITY_DAYS,
  RATE_CARDS,
} from '../proformas/rate-card.js';
import type { User } from '../users/user.entity.js';
import type {
  CustomerResponseDto,
  ProformaDto,
} from './dto/admin-proforma.dto.js';
import type { RecordPaymentDto } from './dto/admin-purchase-request.dto.js';

/** "TXC-NG-2026-001": per country, per year. */
export function formatProformaReference(
  country: string,
  year: number,
  seq: number,
) {
  return `TXC-${country}-${year}-${String(seq).padStart(3, '0')}`;
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const newShareToken = () => randomBytes(24).toString('base64url');

/** Proformas still being prepared can be edited; once shared they need a revision. */
const EDITABLE = ['draft', 'ready'] as const;

@Injectable()
export class AdminProformasService {
  constructor(
    @InjectRepository(Proforma)
    private readonly proformas: Repository<Proforma>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(ProformaPayment)
    private readonly payments: Repository<ProformaPayment>,
    private readonly config: ConfigService,
    private readonly income: IncomeService,
    private readonly invoices: InvoicesService,
  ) {}

  private async loadLead(leadId: number) {
    const lead = await this.leads.findOne({
      where: { id: leadId },
      relations: { booking: { customer: true }, quoteRequest: true },
    });
    if (!lead) throw new NotFoundException('Lead not found.');
    return lead;
  }

  /** The current (latest, not superseded) proforma for a lead, if any. */
  current(leadId: number) {
    return this.proformas.findOne({
      where: { lead: { id: leadId }, status: Not('superseded') },
      order: { revision: 'DESC' },
    });
  }

  /** What Create Proforma starts with: the customer, the survey's measurements and the rates. */
  async defaults(leadId: number) {
    const lead = await this.loadLead(leadId);
    const b = lead.booking;
    const r = lead.quoteRequest;
    const contact = b ?? r;
    const address = b
      ? [b.address, b.city, b.state].filter(Boolean).join(', ')
      : r
        ? [r.address, r.city, r.state].filter(Boolean).join(', ')
        : '';
    const s = lead.survey;
    const treatment: ProformaTreatment = {
      areas: s?.areas ?? [],
      landArea: s?.landArea ?? null,
      bushClearing: s?.bushClearing ?? false,
      clearArea: s?.clearArea ?? null,
      entryPoints: s?.entryPoints ?? null,
      baitStations: s?.baitStations ?? null,
      followUpVisits: s?.followUpVisits ?? null,
    };
    const currency = lead.country === 'BJ' ? 'XOF' : 'NGN';
    const today = todayInWat();
    return {
      customer: {
        name:
          b?.customer?.name ?? (r?.organisationName || contact?.fullName || ''),
        phone: contact?.phone ?? '',
        email: contact?.email ?? '',
        address,
        taxId: null,
        billingAddress: null,
      },
      serviceAddress: address,
      country: lead.country,
      currency,
      language: lead.country === 'BJ' ? 'fr' : 'en',
      treatment,
      /** Whether the measurements came from a site survey. */
      fromSurvey: Boolean(s),
      rates: RATE_CARDS[currency],
      /** Bulk quotes: the requested products, and how they reach the customer. */
      products: r
        ? r.items.map((i) => ({
            productName: i.productName,
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? null,
          }))
        : [],
      fulfilment: r
        ? {
            method: r.deliveryMethod,
            address: r.deliveryMethod === 'delivery' ? address : null,
          }
        : null,
      discountPercent: 0,
      taxPercent: DEFAULT_TAX_PERCENT[lead.country],
      // Bulk orders go straight to a purchase request; no deposit step.
      depositPercent: r ? 0 : DEFAULT_DEPOSIT_PERCENT,
      paymentTerms: null,
      validUntil: addDays(today, QUOTE_VALIDITY_DAYS),
      upfrontDiscountPercent: DEFAULT_UPFRONT_DISCOUNT_PERCENT,
    };
  }

  /** Columns to store for `dto`, with every amount worked out here. */
  private columns(dto: ProformaDto) {
    const plan = dto.servicePlan;
    const servicePlan = plan
      ? {
          startDate: plan.startDate,
          durationMonths: plan.durationMonths,
          maintenanceIntervalMonths: plan.maintenanceIntervalMonths,
          billing: plan.billing,
          monthlyFee: plan.monthlyFee,
          maintenanceVisitFee: plan.maintenanceVisitFee,
          upfrontDiscountPercent: plan.upfrontDiscountPercent,
        }
      : null;
    const totals = priceProforma({
      lines: dto.lines.map((l) => ({
        section: l.section,
        description: l.description,
        detail: l.detail || null,
        quantity: l.quantity,
        unit: l.unit,
        unitRate: l.unitRate,
      })),
      discountPercent: dto.discountPercent,
      taxPercent: dto.taxPercent,
      depositPercent: dto.depositPercent,
      servicePlan,
    });
    const t = dto.treatment;
    return {
      customer: {
        name: dto.customer.name,
        phone: dto.customer.phone,
        email: dto.customer.email.toLowerCase(),
        address: dto.customer.address,
        taxId: dto.customer.taxId || null,
        billingAddress: dto.customer.billingAddress || null,
      },
      serviceAddress: dto.serviceAddress,
      currency: dto.currency,
      language: dto.language,
      treatment: {
        areas: t.areas.map(
          ({ name, length, width, condition, containsStock }) => ({
            name,
            length,
            width,
            condition,
            containsStock,
          }),
        ),
        landArea: t.landArea ?? null,
        bushClearing: t.bushClearing,
        clearArea: t.bushClearing ? (t.clearArea ?? null) : null,
        entryPoints: t.entryPoints ?? null,
        baitStations: t.baitStations ?? null,
        followUpVisits: t.followUpVisits ?? null,
      },
      lines: totals.lines,
      discountPercent: dto.discountPercent,
      taxPercent: dto.taxPercent,
      depositPercent: dto.depositPercent,
      paymentTerms: dto.paymentTerms || null,
      validUntil: dto.validUntil || null,
      fulfilment: dto.fulfilment
        ? {
            method: dto.fulfilment.method,
            address:
              dto.fulfilment.method === 'delivery'
                ? dto.fulfilment.address || null
                : null,
          }
        : null,
      servicePlan:
        servicePlan && totals.servicePlan
          ? { ...servicePlan, ...totals.servicePlan }
          : null,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      depositAmount: totals.depositAmount,
    };
  }

  /** "Generate Proforma" needs a complete document; drafts can be partial. */
  private assertComplete(dto: ProformaDto) {
    if (dto.lines.length === 0) {
      throw new BadRequestException('Add at least one service charge.');
    }
    if (dto.lines.some((l) => l.unitRate === 0)) {
      throw new BadRequestException('Enter a unit rate for every charge.');
    }
    if (!dto.validUntil) {
      throw new BadRequestException('Choose how long the proforma is valid.');
    }
    if (dto.validUntil < todayInWat()) {
      throw new BadRequestException('The validity date has already passed.');
    }
  }

  private async nextReference(country: string) {
    const year = Number(todayInWat().slice(0, 4));
    const prefix = `TXC-${country}-${year}-`;
    const count = await this.proformas
      .createQueryBuilder('p')
      .where('p.reference LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('p.revision = 1')
      .getCount();
    return formatProformaReference(country, year, count + 1);
  }

  async create(leadId: number, dto: ProformaDto, user: User) {
    const lead = await this.loadLead(leadId);
    if (!OPEN_LEAD_STATUSES.includes(lead.status)) {
      throw new ConflictException('This lead is already closed.');
    }
    if (await this.current(lead.id)) {
      throw new ConflictException('This lead already has a proforma.');
    }
    if (dto.generate) this.assertComplete(dto);
    const saved = await this.proformas.save(
      this.proformas.create({
        ...this.columns(dto),
        reference: await this.nextReference(lead.country),
        revision: 1,
        lead: { id: lead.id },
        country: lead.country,
        status: dto.generate ? 'ready' : 'draft',
        generatedAt: dto.generate ? new Date() : null,
        shareToken: dto.generate ? newShareToken() : null,
        createdBy: { id: user.id },
      }),
    );
    return this.get(saved.id);
  }

  async update(id: number, dto: ProformaDto) {
    const proforma = await this.find(id);
    if (!(EDITABLE as readonly string[]).includes(proforma.status)) {
      throw new ConflictException(
        'This proforma has been shared; revise it instead.',
      );
    }
    if (dto.generate) this.assertComplete(dto);
    await this.proformas.update(proforma.id, {
      ...this.columns(dto),
      status: dto.generate ? 'ready' : 'draft',
      generatedAt: dto.generate ? new Date() : proforma.generatedAt,
      shareToken:
        proforma.shareToken ?? (dto.generate ? newShareToken() : null),
    });
    return this.get(proforma.id);
  }

  /** What the customer said about a sent proforma. */
  async recordResponse(id: number, dto: CustomerResponseDto) {
    const proforma = await this.find(id);
    if (proforma.status !== 'sent') {
      throw new ConflictException(
        'Record a response once the proforma has been sent.',
      );
    }
    if (dto.date > todayInWat()) {
      throw new BadRequestException(
        'The response date can’t be in the future.',
      );
    }
    await this.proformas.update(proforma.id, {
      status: dto.response,
      responseDate: dto.date,
      responseNote: dto.note || null,
    });
    // Accepted: the customer is invoiced for the proforma's total.
    if (dto.response === 'accepted') {
      const lead = await this.leads.findOne({
        where: { id: proforma.lead.id },
        relations: { booking: true },
      });
      await this.invoices.forProforma(proforma, {
        source: proforma.lead.source,
        booking: lead?.booking ?? null,
      });
    }
    return this.get(id);
  }

  /**
   * A new revision (Rev. 2, …) with the same reference, replacing a shared proforma; the
   * old one is kept read-only and its link says it has been replaced.
   */
  async revise(id: number, dto: ProformaDto, user: User) {
    const previous = await this.find(id);
    if (!['sent', 'revision_requested', 'declined'].includes(previous.status)) {
      throw new ConflictException('Only a shared proforma can be revised.');
    }
    if (!OPEN_LEAD_STATUSES.includes(previous.lead.status)) {
      throw new ConflictException('This lead is already closed.');
    }
    if (dto.generate) this.assertComplete(dto);
    const saved = await this.proformas.save(
      this.proformas.create({
        ...this.columns(dto),
        reference: previous.reference,
        revision: previous.revision + 1,
        lead: { id: previous.lead.id },
        country: previous.country,
        status: dto.generate ? 'ready' : 'draft',
        generatedAt: dto.generate ? new Date() : null,
        shareToken: dto.generate ? newShareToken() : null,
        createdBy: { id: user.id },
      }),
    );
    await this.proformas.update(previous.id, { status: 'superseded' });
    return this.get(saved.id);
  }

  /** A deposit (or further) payment against an accepted proforma. */
  async recordPayment(id: number, dto: RecordPaymentDto, user: User) {
    const proforma = await this.find(id);
    if (proforma.status !== 'accepted') {
      throw new ConflictException(
        'Payments are recorded once the customer has accepted.',
      );
    }
    const paid = await this.amountPaid(proforma.id);
    if (dto.amount > proforma.total - paid) {
      throw new BadRequestException(
        'The amount is more than the balance of the proforma.',
      );
    }
    const payment = await this.payments.save(
      this.payments.create({
        proforma: { id: proforma.id },
        amount: dto.amount,
        method: dto.method,
        paidOn: dto.paidOn,
        account: dto.account,
        recordedBy: { id: user.id },
      }),
    );
    await this.income.record({
      country: proforma.country,
      source:
        proforma.lead.source === 'bulk_quote' ? 'product_sales' : 'services',
      receivedFrom: proforma.customer.name,
      description: `Payment for ${proforma.reference}`,
      amount: dto.amount,
      date: dto.paidOn,
      method: dto.method,
      accountName: dto.account,
      proforma,
      invoice: await this.invoices.linkedTo({ proformaId: proforma.id }),
      sourcePayment: `proforma-payment:${payment.id}`,
      recordedBy: user,
    });
    return this.get(id);
  }

  private async amountPaid(proformaId: number) {
    const rows = await this.payments.find({
      where: { proforma: { id: proformaId } },
    });
    return rows.reduce((sum, p) => sum + p.amount, 0);
  }

  /** Marks a generated proforma as shared with the customer; the lead becomes Quoted. */
  async markSent(id: number) {
    const proforma = await this.find(id);
    if (proforma.status === 'sent') return this.get(id);
    if (proforma.status !== 'ready') {
      throw new ConflictException('Generate the proforma before sending it.');
    }
    await this.proformas.update(proforma.id, {
      status: 'sent',
      sentAt: new Date(),
    });
    if (OPEN_LEAD_STATUSES.includes(proforma.lead.status)) {
      await this.leads.update(proforma.lead.id, { status: 'quoted' });
    }
    return this.get(id);
  }

  /** What the printable proforma shows. Drafts have no document. */
  private async document(proforma: Proforma) {
    if (proforma.status === 'draft') {
      throw new NotFoundException('Proforma not found.');
    }
    const lead = await this.loadLead(proforma.lead.id);
    const s = lead.survey;
    return {
      kind: lead.source === 'bulk_quote' ? 'bulk' : 'service',
      reference: proforma.reference,
      revision: proforma.revision,
      status: proforma.status,
      fulfilment: proforma.fulfilment,
      country: proforma.country,
      currency: proforma.currency,
      language: proforma.language,
      customer: proforma.customer,
      serviceAddress: proforma.serviceAddress,
      service: lead.booking?.serviceName ?? 'Bulk Supply',
      issuedOn: (proforma.generatedAt ?? proforma.createdAt)
        .toISOString()
        .slice(0, 10),
      validUntil: proforma.validUntil,
      included: s
        ? [s.recommendedTreatment, s.estimatedScope].filter(Boolean).join(' ')
        : null,
      lines: proforma.lines,
      subtotal: proforma.subtotal,
      discountPercent: proforma.discountPercent,
      discountAmount: proforma.discountAmount,
      taxPercent: proforma.taxPercent,
      taxAmount: proforma.taxAmount,
      total: proforma.total,
      depositPercent: proforma.depositPercent,
      depositAmount: proforma.depositAmount,
      paymentTerms: proforma.paymentTerms,
      servicePlan: proforma.servicePlan,
      bank: bankDetails(
        this.config.get<string>(`BANK_DETAILS_${proforma.country}`),
      ),
    };
  }

  /** Staff preview of the document. */
  async documentFor(id: number) {
    return this.document(await this.find(id));
  }

  /** The customer's view, from the link they were sent. */
  async shared(token: string) {
    const proforma = await this.proformas.findOne({
      where: { shareToken: token },
      relations: { lead: true },
    });
    if (!proforma) throw new NotFoundException('Proforma not found.');
    return this.document(proforma);
  }

  private async find(id: number) {
    const proforma = await this.proformas.findOne({
      where: { id },
      relations: { lead: true },
    });
    if (!proforma) throw new NotFoundException('Proforma not found.');
    return proforma;
  }

  async get(id: number) {
    const { lead, ...proforma } = await this.find(id);
    const payments = await this.payments.find({
      where: { proforma: { id } },
      order: { paidOn: 'ASC', createdAt: 'ASC' },
    });
    const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const invoice = await this.invoices.linkedTo({ proformaId: id });
    return {
      ...proforma,
      invoice: invoice && { id: invoice.id, reference: invoice.reference },
      leadId: lead.id,
      leadReference: lead.reference,
      payments: payments.map(
        ({ id: pid, amount, method, paidOn, account }) => ({
          id: pid,
          amount,
          method,
          paidOn,
          account,
        }),
      ),
      amountPaid,
      depositPaid: amountPaid >= proforma.depositAmount,
    };
  }
}
