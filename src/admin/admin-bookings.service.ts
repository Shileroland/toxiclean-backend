import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
  type FindOptionsWhere,
} from 'typeorm';
import {
  Booking,
  type BookingPhoto,
  type BookingStatus,
} from '../bookings/booking.entity.js';
import { formatBookingReference } from '../bookings/bookings.service.js';
import { CustomersService } from '../customers/customers.service.js';
import type { Fumigator } from '../fumigators/fumigator.entity.js';
import { FumigatorsService } from '../fumigators/fumigators.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { Country } from './admin.service.js';
import type {
  AdminCreateBookingDto,
  ScheduleDto,
  StatusDto,
} from './dto/admin-booking.dto.js';

/** Statuses an admin can move a job to from each status (one step at a time). */
const NEXT_STATUS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  requested: ['closed'],
  scheduled: ['on_the_way', 'closed'],
  on_the_way: ['in_progress', 'closed'],
  in_progress: ['completed'],
  completed: ['closed'],
  follow_up_required: ['closed'],
};

/** Jobs on the calendar: anything with a confirmed date that isn't a plain request. */
const ON_CALENDAR = Not(In(['requested'] as BookingStatus[]));

export type CalendarFilters = {
  country: Country;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  fumigatorId?: string;
  service?: string;
};

/** A booking as admins see it: photo file names stay server-side. */
export function toAdminJob(booking: Booking) {
  const { photos, followUpOf, user, ...rest } = booking;
  return {
    ...rest,
    photos: photos.map(({ originalName, mimeType, size }: BookingPhoto) => ({
      originalName,
      mimeType,
      size,
    })),
    followUpOf: followUpOf
      ? { id: followUpOf.id, reference: followUpOf.reference }
      : null,
    hasAccount: Boolean(user),
  };
}

const namesOf = (fumigators: Fumigator[]) =>
  fumigators
    .map((f) => f.fullName)
    .join(', ')
    .slice(0, 200) || null;

@Injectable()
export class AdminBookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
    private readonly customers: CustomersService,
    private readonly fumigators: FumigatorsService,
    private readonly storage: StorageService,
  ) {}

  /** Scheduled jobs that overlap [from, to], with their fumigators. */
  async calendar({ country, from, to, fumigatorId, service }: CalendarFilters) {
    const base: FindOptionsWhere<Booking> = {
      country,
      status: ON_CALENDAR,
      ...(service && { serviceSlug: service }),
    };
    const rows = await this.bookings.find({
      where: [
        // Starts by `to` and ends on or after `from`; older rows have no end date.
        {
          ...base,
          scheduledDate: LessThanOrEqual(to),
          endDate: MoreThanOrEqual(from),
        },
        { ...base, scheduledDate: Between(from, to), endDate: IsNull() },
      ],
      relations: { fumigators: true },
      order: { scheduledDate: 'ASC', scheduledTime: 'ASC' },
    });
    const jobs = fumigatorId
      ? rows.filter((b) => b.fumigators.some((f) => f.id === fumigatorId))
      : rows;
    return jobs.map(toAdminJob);
  }

  /** Website requests to schedule, and customers' pending reschedule/cancel requests. */
  async needsAttention(country: Country) {
    const rows = await this.bookings.find({
      where: [
        { country, status: 'requested' },
        { country, rescheduleRequest: Not(IsNull()) },
        { country, cancellationRequest: Not(IsNull()) },
      ],
      relations: { fumigators: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toAdminJob);
  }

  private async find(id: number) {
    const booking = await this.bookings.findOne({
      where: { id },
      relations: {
        fumigators: true,
        customer: true,
        followUpOf: true,
        user: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  async get(id: number) {
    return toAdminJob(await this.find(id));
  }

  /** Checks the times and returns the columns to store. */
  private scheduleColumns(schedule: ScheduleDto) {
    const endDate = schedule.endDate ?? schedule.date;
    if (
      endDate < schedule.date ||
      (endDate === schedule.date && schedule.endTime <= schedule.startTime)
    ) {
      throw new BadRequestException('The job must end after it starts.');
    }
    return {
      scheduledDate: schedule.date,
      scheduledTime: schedule.startTime,
      endDate,
      endTime: schedule.endTime,
    };
  }

  /**
   * Confirms a website request (or a customer's reschedule request) with a date, time
   * and fumigators, and links the booking to its customer record.
   */
  async schedule(id: number, schedule: ScheduleDto) {
    const booking = await this.find(id);
    if (booking.status !== 'requested' && booking.status !== 'scheduled') {
      throw new ConflictException(
        'Only requested or scheduled jobs can be scheduled.',
      );
    }
    const fumigators = await this.fumigators.forAssignment(
      schedule.fumigatorIds,
      booking.country,
    );
    Object.assign(booking, this.scheduleColumns(schedule), {
      status: 'scheduled',
      fumigators,
      assignedFumigator: namesOf(fumigators),
      rescheduleRequest: null,
      customer: booking.customer ?? (await this.customers.forBooking(booking)),
    });
    return toAdminJob(await this.bookings.save(booking));
  }

  async changeStatus(id: number, { status }: StatusDto) {
    const booking = await this.find(id);
    if (!NEXT_STATUS[booking.status]?.includes(status)) {
      throw new ConflictException(
        `A ${booking.status.replace(/_/g, ' ')} job can't be marked ${status.replace(/_/g, ' ')}.`,
      );
    }
    booking.status = status;
    if (status === 'completed') booking.completedAt = new Date();
    if (status === 'closed') {
      booking.closedAt = new Date();
      booking.rescheduleRequest = null;
      booking.cancellationRequest = null;
    }
    return toAdminJob(await this.bookings.save(booking));
  }

  /** Clears a customer's pending reschedule or cancellation request without acting on it. */
  async declineRequest(id: number) {
    const booking = await this.find(id);
    booking.rescheduleRequest = null;
    booking.cancellationRequest = null;
    return toAdminJob(await this.bookings.save(booking));
  }

  async markFollowUpRequired(id: number, reason: string) {
    const booking = await this.find(id);
    if (booking.status !== 'completed') {
      throw new ConflictException('Only completed jobs can need a follow-up.');
    }
    booking.status = 'follow_up_required';
    booking.followUpReason = reason;
    return toAdminJob(await this.bookings.save(booking));
  }

  /** Books the follow-up visit as a new job and closes the original. */
  async scheduleFollowUp(id: number, schedule: ScheduleDto) {
    const original = await this.find(id);
    if (original.status !== 'follow_up_required') {
      throw new ConflictException('Mark the job as needing a follow-up first.');
    }
    const fumigators = await this.fumigators.forAssignment(
      schedule.fumigatorIds,
      original.country,
    );
    const columns = this.scheduleColumns(schedule);
    const followUp = await this.bookings.save(
      this.bookings.create({
        ...pickCopied(original),
        ...columns,
        preferredDate: columns.scheduledDate,
        status: 'scheduled',
        fumigators,
        assignedFumigator: namesOf(fumigators),
        issue:
          `Follow-up to ${original.reference}: ${original.followUpReason ?? ''}`.trim(),
        followUpOf: original,
      }),
    );
    followUp.reference = formatBookingReference(followUp.id);
    await this.bookings.update(followUp.id, { reference: followUp.reference });

    original.status = 'closed';
    original.closedAt = new Date();
    await this.bookings.save(original);
    return toAdminJob(followUp);
  }

  async assignFumigators(id: number, fumigatorIds: string[]) {
    const booking = await this.find(id);
    if (booking.status === 'closed') {
      throw new ConflictException('This job is closed.');
    }
    booking.fumigators = await this.fumigators.forAssignment(
      fumigatorIds,
      booking.country,
    );
    booking.assignedFumigator = namesOf(booking.fumigators);
    return toAdminJob(await this.bookings.save(booking));
  }

  async setTreatmentPlan(id: number, treatmentPlan: string) {
    const booking = await this.find(id);
    booking.treatmentPlan = treatmentPlan || null;
    return toAdminJob(await this.bookings.save(booking));
  }

  /** A booking made by the team for a customer, already scheduled. */
  async create(dto: AdminCreateBookingDto, photos: BookingPhoto[]) {
    const customer = await this.customers.get(dto.customerId);
    const location = await this.customers.location(customer.id, dto.locationId);
    const fumigators = await this.fumigators.forAssignment(
      dto.fumigatorIds,
      customer.country,
    );
    const columns = this.scheduleColumns(dto);
    const saved = await this.bookings.save(
      this.bookings.create({
        ...columns,
        status: 'scheduled',
        serviceCategory: dto.serviceCategory,
        serviceSlug: dto.serviceSlug,
        serviceName: dto.serviceName,
        propertyType: dto.propertyType,
        issue: dto.issue ?? '',
        treatmentPlan: dto.treatmentPlan || null,
        photos,
        fullName: customer.name,
        phone: customer.phone,
        email: customer.email,
        preferredContactMethod: customer.preferredContactMethod,
        country: customer.country,
        state: location.state,
        city: location.city,
        address: location.address,
        preferredDate: columns.scheduledDate,
        preferredTime: 'morning',
        customer,
        user: customer.user,
        fumigators,
        assignedFumigator: namesOf(fumigators),
      }),
    );
    saved.reference = formatBookingReference(saved.id);
    await this.bookings.update(saved.id, { reference: saved.reference });
    return toAdminJob(saved);
  }

  async openPhoto(id: number, index: number) {
    const booking = await this.find(id);
    const photo = booking.photos[index];
    if (!photo) throw new NotFoundException('Photo not found.');
    const stream = await this.storage
      .get(`bookings/${photo.fileName}`, photo.storage)
      .catch(() => {
        throw new NotFoundException('Photo file is missing.');
      });
    return { photo, stream };
  }
}

/** What a follow-up job carries over from the original. */
function pickCopied(b: Booking) {
  return {
    serviceCategory: b.serviceCategory,
    serviceSlug: b.serviceSlug,
    serviceName: b.serviceName,
    propertyType: b.propertyType,
    photos: [],
    fullName: b.fullName,
    phone: b.phone,
    email: b.email,
    preferredContactMethod: b.preferredContactMethod,
    country: b.country,
    state: b.state,
    city: b.city,
    address: b.address,
    preferredTime: b.preferredTime,
    treatmentPlan: b.treatmentPlan,
    customer: b.customer,
    user: b.user,
  };
}
