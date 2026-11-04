import { InventoryService } from '../catalog/inventory.service.js';
import { IncomeService } from '../finance/income.service.js';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Booking, type BookingStatus } from '../bookings/booking.entity.js';
import { todayInWat } from '../bookings/bookings.service.js';
import {
  COUNTRIES,
  QuoteRequest,
} from '../quote-requests/quote-request.entity.js';
import { Lead, OPEN_LEAD_STATUSES } from '../leads/lead.entity.js';

export type Country = (typeof COUNTRIES)[number];

export type Activity =
  | {
      kind: 'booking';
      id: number;
      reference: string | null;
      title: string;
      customer: string;
      createdAt: Date;
    }
  | {
      kind: 'request';
      id: number;
      reference: string | null;
      title: string;
      createdAt: Date;
    };

export type AdminOverview = {
  country: Country;
  /** Visits scheduled for today (West Africa Time) that haven't been cancelled. */
  todayJobs: number;
  /** Booking requests the team hasn't scheduled yet. */
  openLeads: number;
  /** Product / bulk quote requests nobody has picked up yet. */
  pendingRequests: number;
  /** Products at or below their reorder level somewhere in the country. */
  lowStock: number;
  /** Income recorded this month, in the country's currency. */
  revenue: number;
  recentActivity: Activity[];
};

const RECENT = 5;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
    @InjectRepository(QuoteRequest)
    private readonly quoteRequests: Repository<QuoteRequest>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    private readonly inventory: InventoryService,
    private readonly income: IncomeService,
  ) {}

  async overview(country: Country): Promise<AdminOverview> {
    const today = todayInWat();
    const onToday = {
      country,
      status: In([
        'scheduled',
        'on_the_way',
        'in_progress',
        'completed',
        'follow_up_required',
      ] as BookingStatus[]),
    };
    const [todayJobs, openLeads, pendingRequests, bookings, requests] =
      await Promise.all([
        this.bookings.count({
          // Includes multi-day jobs that started earlier and run through today.
          where: [
            { ...onToday, scheduledDate: today, endDate: IsNull() },
            {
              ...onToday,
              scheduledDate: LessThanOrEqual(today),
              endDate: MoreThanOrEqual(today),
            },
          ],
        }),
        this.leads.count({
          where: { country, status: In(OPEN_LEAD_STATUSES) },
        }),
        // Bulk quotes are followed up as leads, so only product requests count here.
        this.quoteRequests.count({
          where: { country, kind: 'product', status: 'requested' },
        }),
        this.bookings.find({
          where: { country },
          order: { createdAt: 'DESC' },
          take: RECENT,
        }),
        this.quoteRequests.find({
          where: { country },
          order: { createdAt: 'DESC' },
          take: RECENT,
        }),
      ]);

    const recentActivity: Activity[] = [
      ...bookings.map((b) => ({
        kind: 'booking' as const,
        id: b.id,
        reference: b.reference,
        title: b.serviceName,
        customer: b.fullName,
        createdAt: b.createdAt,
      })),
      ...requests.map((r) => ({
        kind: 'request' as const,
        id: r.id,
        reference: r.reference,
        title: r.organisationName ?? r.fullName,
        createdAt: r.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, RECENT);

    return {
      country,
      todayJobs,
      openLeads,
      pendingRequests,
      lowStock: await this.inventory.lowStockCount(country),
      revenue: await this.income.revenueThisMonth(country),
      recentActivity,
    };
  }
}
