import { InventoryService } from '../catalog/inventory.service.js';
import { InvoicesService } from '../finance/invoices.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';
import { Booking, type BookingPhoto } from '../bookings/booking.entity.js';
import { CustomersService } from '../customers/customers.service.js';
import { MAX_PHOTOS, storeBookingPhotos } from '../bookings/photo-storage.js';
import {
  Lead,
  LeadContact,
  type LeadSource,
  type LeadStatus,
  type SiteSurvey,
  LEAD_SOURCES,
  LEAD_STATUSES,
  OPEN_LEAD_STATUSES,
} from '../leads/lead.entity.js';
import { Proforma, ProformaPayment } from '../proformas/proforma.entity.js';
import { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { User } from '../users/user.entity.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import type { Country } from './admin.service.js';
import type { AdminCreateBookingDto } from './dto/admin-booking.dto.js';
import type {
  LogLeadContactDto,
  MarkLeadLostDto,
  SiteSurveyDto,
} from './dto/admin-lead.dto.js';

export const PAGE_SIZE = 10;

export const isLeadStatus = (value: string): value is LeadStatus =>
  (LEAD_STATUSES as readonly string[]).includes(value);

export const isLeadSource = (value: string): value is LeadSource =>
  (LEAD_SOURCES as readonly string[]).includes(value);

export type LeadFilters = {
  country: Country;
  q?: string;
  statuses?: LeadStatus[];
  sources?: LeadSource[];
  page: number;
};

/** "08:30" on a YYYY-MM-DD in West Africa Time (UTC+1) as a Date. */
const watDateTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00+01:00`);

/** The name shown for a lead: the customer record's, the organisation's, or the person's. */
function customerName(lead: Lead) {
  if (lead.booking) return lead.booking.customer?.name ?? lead.booking.fullName;
  if (lead.quoteRequest)
    return lead.quoteRequest.organisationName || lead.quoteRequest.fullName;
  return '—';
}

const staffOf = (user: User | null) =>
  user ? { id: user.id, fullName: user.fullName } : null;

@Injectable()
export class AdminLeadsService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadContact)
    private readonly contacts: Repository<LeadContact>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(QuoteRequest)
    private readonly requests: Repository<QuoteRequest>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Proforma)
    private readonly proformas: Repository<Proforma>,
    @InjectRepository(ProformaPayment)
    private readonly proformaPayments: Repository<ProformaPayment>,
    private readonly storage: StorageService,
    private readonly people: CustomersService,
    private readonly adminBookings: AdminBookingsService,
    private readonly inventory: InventoryService,
    private readonly invoices: InvoicesService,
  ) {}

  async list({ country, q, statuses, sources, page }: LeadFilters) {
    const query = this.leads
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.booking', 'b')
      .leftJoinAndSelect('b.customer', 'bc')
      .leftJoinAndSelect('l.quoteRequest', 'r')
      .leftJoinAndSelect('l.assignedTo', 'u')
      .where('l.country = :country', { country })
      .orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (statuses?.length)
      query.andWhere('l.status IN (:...statuses)', { statuses });
    if (sources?.length)
      query.andWhere('l.source IN (:...sources)', { sources });
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query.andWhere(
        new Brackets((w) =>
          w
            .where('l.reference ILIKE :like', { like })
            .orWhere('b.fullName ILIKE :like', { like })
            .orWhere('bc.name ILIKE :like', { like })
            .orWhere('r.fullName ILIKE :like', { like })
            .orWhere('r.organisationName ILIKE :like', { like }),
        ),
      );
    }
    const [rows, total] = await query.getManyAndCount();
    return {
      items: rows.map((l) => ({
        id: l.id,
        reference: l.reference,
        source: l.source,
        customer: customerName(l),
        createdAt: l.createdAt,
        status: l.status,
        assignedTo: staffOf(l.assignedTo),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Staff a lead can be assigned to. */
  async staff() {
    const users = await this.users.find({
      where: { role: In(['admin', 'super_admin']) },
      order: { fullName: 'ASC' },
    });
    return users.map(staffOf);
  }

  private async load(id: number) {
    const lead = await this.leads.findOne({
      where: { id },
      relations: {
        booking: { customer: true },
        quoteRequest: true,
        assignedTo: true,
        contacts: { loggedBy: true },
      },
      order: { contacts: { contactedAt: 'DESC' } },
    });
    if (!lead) throw new NotFoundException('Lead not found.');
    return lead;
  }

  async get(id: number) {
    const lead = await this.load(id);
    const proforma = await this.proformas.findOne({
      where: { lead: { id: lead.id }, status: Not('superseded') },
      order: { revision: 'DESC' },
    });
    const payments = proforma
      ? await this.proformaPayments.find({
          where: { proforma: { id: proforma.id } },
          order: { paidOn: 'ASC', createdAt: 'ASC' },
        })
      : [];
    const invoice = proforma
      ? await this.invoices.linkedTo({ proformaId: proforma.id })
      : null;
    const b = lead.booking;
    const r = lead.quoteRequest;
    const contact = b ?? r;
    return {
      id: lead.id,
      reference: lead.reference,
      source: lead.source,
      status: lead.status,
      country: lead.country,
      createdAt: lead.createdAt,
      closedAt: lead.closedAt,
      lostReason: lead.lostReason,
      lostNote: lead.lostNote,
      assignedTo: staffOf(lead.assignedTo),
      customer: {
        name: customerName(lead),
        contactName: contact?.fullName ?? null,
        phone: contact?.phone ?? null,
        email: contact?.email ?? null,
        preferredContactMethod: contact?.preferredContactMethod ?? null,
        customerId: b?.customer?.id ?? null,
      },
      booking: b && {
        id: b.id,
        reference: b.reference,
        status: b.status,
        serviceCategory: b.serviceCategory,
        serviceSlug: b.serviceSlug,
        serviceName: b.serviceName,
        scheduledDate: b.scheduledDate,
        scheduledTime: b.scheduledTime,
        endDate: b.endDate,
        endTime: b.endTime,
        treatmentPlan: b.treatmentPlan,
        propertyType: b.propertyType,
        address: [b.address, b.city, b.state].filter(Boolean).join(', '),
        preferredDate: b.preferredDate,
        preferredTime: b.preferredTime,
        issue: b.issue,
        photos: b.photos.map((p) => ({ originalName: p.originalName })),
      },
      quote: r && {
        id: r.id,
        reference: r.reference,
        status: r.status,
        confirmedTotal: r.confirmedTotal,
        items: r.items.map(({ productName, quantity }) => ({
          productName,
          quantity,
        })),
        deliveryMethod: r.deliveryMethod,
        address: [r.address, r.city, r.state].filter(Boolean).join(', '),
        tenderReference: r.tenderReference,
        notes: r.notes,
      },
      survey: lead.survey && {
        ...lead.survey,
        photos: lead.survey.photos.map((p) => ({
          originalName: p.originalName,
        })),
      },
      proforma: proforma && {
        id: proforma.id,
        reference: proforma.reference,
        revision: proforma.revision,
        status: proforma.status,
        currency: proforma.currency,
        total: proforma.total,
        depositPercent: proforma.depositPercent,
        depositAmount: proforma.depositAmount,
        validUntil: proforma.validUntil,
        createdAt: proforma.createdAt,
        sentAt: proforma.sentAt,
        responseDate: proforma.responseDate,
        responseNote: proforma.responseNote,
        amountPaid: payments.reduce((sum, p) => sum + p.amount, 0),
        invoice: invoice && { id: invoice.id, reference: invoice.reference },
        payments: payments.map(({ id: pid, amount, paidOn, account }) => ({
          id: pid,
          amount,
          paidOn,
          account,
        })),
      },
      contacts: lead.contacts.map((c) => ({
        id: c.id,
        method: c.method,
        outcome: c.outcome,
        contactedAt: c.contactedAt,
        note: c.note,
        loggedBy: c.loggedBy?.fullName ?? null,
      })),
    };
  }

  private assertOpen(lead: Lead) {
    if (!OPEN_LEAD_STATUSES.includes(lead.status)) {
      throw new ConflictException('This lead is already closed.');
    }
  }

  async assign(id: number, userId: string) {
    const lead = await this.load(id);
    this.assertOpen(lead);
    const user = await this.staffMember(userId);
    await this.leads.update(lead.id, { assignedTo: { id: user.id } });
    return this.get(lead.id);
  }

  /** Reaching the customer moves a new lead to Contacted. */
  async logContact(id: number, dto: LogLeadContactDto, user: User) {
    const lead = await this.load(id);
    this.assertOpen(lead);
    await this.contacts.save(
      this.contacts.create({
        lead: { id: lead.id },
        method: dto.method,
        outcome: dto.outcome,
        contactedAt: watDateTime(dto.date, dto.time),
        note: dto.note,
        loggedBy: { id: user.id },
      }),
    );
    if (lead.status === 'new' && dto.outcome === 'customer_reached') {
      await this.leads.update(lead.id, { status: 'contacted' });
    }
    return this.get(lead.id);
  }

  /** Closes the lead and its enquiry, so the customer's account shows it ended. */
  async markLost(id: number, { reason, note }: MarkLeadLostDto) {
    const lead = await this.load(id);
    this.assertOpen(lead);
    const now = new Date();
    await this.leads.update(lead.id, {
      status: 'lost',
      lostReason: reason,
      lostNote: note || null,
      closedAt: now,
    });
    if (lead.booking) {
      await this.bookings.update(lead.booking.id, {
        status: 'closed',
        closedAt: now,
      });
    }
    if (lead.quoteRequest) {
      await this.requests.update(lead.quoteRequest.id, {
        status: 'declined',
        declineReason: note || null,
      });
    }
    return this.get(lead.id);
  }

  private async staffMember(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      throw new BadRequestException('Choose a staff member.');
    }
    return user;
  }

  /** Records the site survey, or replaces it when edited (its photos are kept). */
  async saveSurvey(id: number, dto: SiteSurveyDto) {
    const lead = await this.load(id);
    this.assertOpen(lead);
    const surveyor = await this.staffMember(dto.surveyedById);
    const survey: SiteSurvey = {
      date: dto.date,
      surveyedBy: { id: surveyor.id, fullName: surveyor.fullName },
      pestsIdentified: dto.pestsIdentified,
      findings: dto.findings,
      areas: dto.areas.map(
        ({ name, length, width, condition, containsStock }) => ({
          name,
          length,
          width,
          condition,
          containsStock,
        }),
      ),
      landArea: dto.landArea ?? null,
      bushClearing: dto.bushClearing,
      clearArea: dto.bushClearing ? (dto.clearArea ?? null) : null,
      entryPoints: dto.entryPoints ?? null,
      baitStations: dto.baitStations ?? null,
      followUpVisits: dto.followUpVisits ?? null,
      recommendedTreatment: dto.recommendedTreatment,
      estimatedScope: dto.estimatedScope || null,
      photos: lead.survey?.photos ?? [],
      recordedAt: new Date().toISOString(),
    };
    await this.leads.update(lead.id, { survey });
    return this.get(lead.id);
  }

  private async surveyOf(id: number) {
    const lead = await this.load(id);
    if (!lead.survey) throw new ConflictException('Record the survey first.');
    return { lead, survey: lead.survey };
  }

  async addSurveyPhotos(
    id: number,
    files: { buffer: Buffer; originalname: string; size: number }[],
  ) {
    const { lead, survey } = await this.surveyOf(id);
    this.assertOpen(lead);
    if (survey.photos.length + files.length > MAX_PHOTOS) {
      throw new BadRequestException(
        `A survey can have up to ${MAX_PHOTOS} photos.`,
      );
    }
    const added = await storeBookingPhotos(files, this.storage, 'surveys');
    await this.leads.update(lead.id, {
      survey: { ...survey, photos: [...survey.photos, ...added] },
    });
    return this.get(lead.id);
  }

  async removeSurveyPhoto(id: number, index: number) {
    const { lead, survey } = await this.surveyOf(id);
    this.assertOpen(lead);
    const photo = survey.photos[index];
    if (!photo) throw new NotFoundException('Photo not found.');
    await this.leads.update(lead.id, {
      survey: {
        ...survey,
        photos: survey.photos.filter((_, i) => i !== index),
      },
    });
    await this.storage
      .delete(`surveys/${photo.fileName}`, photo.storage)
      .catch(() => {});
    return this.get(lead.id);
  }

  async openSurveyPhoto(id: number, index: number) {
    const { survey } = await this.surveyOf(id);
    const photo = survey.photos[index];
    if (!photo) throw new NotFoundException('Photo not found.');
    const stream = await this.storage
      .get(`surveys/${photo.fileName}`, photo.storage)
      .catch(() => {
        throw new NotFoundException('Photo file is missing.');
      });
    return { photo, stream };
  }

  /**
   * The customer record a service lead's job is booked for (created from the website
   * request if new), with the saved location matching the requested address.
   */
  async conversionCustomer(id: number) {
    const lead = await this.load(id);
    this.assertOpen(lead);
    const b = lead.booking;
    if (!b) throw new BadRequestException('Only service leads become jobs.');
    const customer = b.customer ?? (await this.people.forBooking(b));
    if (!b.customer)
      await this.bookings.update(b.id, { customer: { id: customer.id } });
    const key = (x: { address: string; city: string; state: string }) =>
      [x.address, x.city, x.state].join('|').toLowerCase();
    const location = (await this.people.listLocations(customer.id)).find(
      (l) => key(l) === key(b),
    );
    const {
      id: cid,
      type,
      name,
      phone,
      email,
      country,
      preferredContactMethod,
    } = customer;
    return {
      customer: {
        id: cid,
        type,
        name,
        phone,
        email,
        country,
        preferredContactMethod,
      },
      locationId: location?.id ?? null,
    };
  }

  /**
   * Converts a service lead to a job: the website request is updated with what was
   * agreed and scheduled, and the lead is won. With a proforma, the customer must have
   * accepted it and paid the deposit first.
   */
  async convert(
    id: number,
    dto: AdminCreateBookingDto,
    photos: BookingPhoto[],
  ) {
    const lead = await this.load(id);
    this.assertOpen(lead);
    const b = lead.booking;
    if (!b) throw new BadRequestException('Only service leads become jobs.');
    const proforma = await this.proformas.findOne({
      where: { lead: { id: lead.id }, status: Not('superseded') },
      order: { revision: 'DESC' },
    });
    if (proforma) {
      const payments = await this.proformaPayments.find({
        where: { proforma: { id: proforma.id } },
      });
      const paid = payments.reduce((sum, p) => sum + p.amount, 0);
      if (proforma.status !== 'accepted' || paid < proforma.depositAmount) {
        throw new ConflictException(
          'Convert once the customer has accepted the proforma and paid the deposit.',
        );
      }
    }
    const customer = await this.people.get(dto.customerId);
    const location = await this.people.location(customer.id, dto.locationId);
    await this.bookings.update(b.id, {
      serviceCategory: dto.serviceCategory,
      serviceSlug: dto.serviceSlug,
      serviceName: dto.serviceName,
      propertyType: dto.propertyType,
      issue: dto.issue?.trim() || b.issue,
      treatmentPlan: dto.treatmentPlan?.trim() || null,
      country: location.country,
      state: location.state,
      city: location.city,
      address: location.address,
      customer: { id: customer.id },
      photos: [...b.photos, ...photos],
    });
    const job = await this.adminBookings.schedule(b.id, dto);
    await this.leads.update(lead.id, { status: 'won', closedAt: new Date() });
    return job;
  }

  /**
   * Converts an accepted bulk quotation into a purchase request: the customer's request
   * takes the quoted items, prices and fulfilment and starts at Confirmed, then follows
   * the purchase request workflow. The lead is won.
   */
  async convertToRequest(id: number) {
    const lead = await this.load(id);
    this.assertOpen(lead);
    const r = lead.quoteRequest;
    if (!r)
      throw new BadRequestException('Only bulk quote leads become orders.');
    const proforma = await this.proformas.findOne({
      where: { lead: { id: lead.id }, status: Not('superseded') },
      order: { revision: 'DESC' },
    });
    if (proforma?.status !== 'accepted') {
      throw new ConflictException(
        'Convert once the customer has accepted the quotation.',
      );
    }
    const slugOf = (name: string) =>
      r.items.find((i) => i.productName === name)?.productSlug ??
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const items = proforma.lines.map((l) => ({
      productSlug: slugOf(l.description),
      productName: l.description,
      quantity: l.quantity,
      agreedUnitPrice: l.unitRate,
    }));
    const f = proforma.fulfilment;
    const delivery = f
      ? f.method === 'delivery'
      : r.deliveryMethod === 'delivery';
    await this.requests.update(r.id, {
      items,
      currency: proforma.currency,
      confirmedTotal: proforma.total,
      status: 'confirmed',
      deliveryMethod: delivery ? 'delivery' : 'pickup',
      address: delivery ? (f?.address ?? r.address) : null,
      city: delivery && !f?.address ? r.city : null,
      state: delivery && !f?.address ? r.state : null,
    });
    await this.leads.update(lead.id, { status: 'won', closedAt: new Date() });
    // Confirmed straight away, so the items are held in stock now.
    await this.inventory.reserveFor({
      id: r.id,
      reference: r.reference,
      country: r.country,
      items,
    });
    return { requestId: r.id, reference: r.reference };
  }

  /** Leads still being worked on, for the dashboard. */
  countOpen(country: Country) {
    return this.leads.count({
      where: { country, status: In(OPEN_LEAD_STATUSES) },
    });
  }
}
