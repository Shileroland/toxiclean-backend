import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { Language } from '../users/user.entity.js';
import {
  Booking,
  type BookingPhoto,
  type BookingStatus,
  type TIME_SLOTS,
} from './booking.entity.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

export function formatBookingReference(id: number) {
  return `TX-BK-${String(id).padStart(6, '0')}`;
}

/** Today's date as YYYY-MM-DD in West Africa Time (UTC+1, where both markets are). */
export function todayInWat(now = new Date()) {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  async create(
    dto: CreateBookingDto,
    photos: BookingPhoto[],
    userId?: string,
    language: Language = 'en',
  ) {
    if (dto.preferredDate < todayInWat()) {
      throw new BadRequestException(
        'Choose a preferred date from today onwards.',
      );
    }
    const saved = await this.bookings.save(
      this.bookings.create({
        serviceCategory: dto.serviceCategory,
        serviceSlug: dto.serviceSlug,
        serviceName: dto.serviceName.trim(),
        propertyType: dto.propertyType,
        issue: dto.issue.trim(),
        photos,
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        email: dto.email.trim().toLowerCase(),
        preferredContactMethod: dto.preferredContactMethod,
        country: dto.country,
        state: dto.state.trim(),
        city: dto.city.trim(),
        address: dto.address.trim(),
        preferredDate: dto.preferredDate,
        preferredTime: dto.preferredTime,
        user: userId ? { id: userId } : null,
      }),
    );
    const reference = formatBookingReference(saved.id);
    await this.bookings.update(saved.id, { reference });
    // Sent in the background so a slow email provider doesn't hold up the response.
    saved.reference = reference;
    void this.mail.bookingReceived(saved, language);
    return { reference };
  }

  /**
   * The signed-in user's bookings, newest first. Photo file names and staff notes
   * (treatment plan, follow-up reason) stay server-side.
   */
  async listForUser(userId: string) {
    const rows = await this.bookings.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
    return rows.map(
      ({
        user: _user,
        photos,
        treatmentPlan: _plan,
        followUpReason: _reason,
        ...booking
      }) => ({
        ...booking,
        // Internal: to the customer the visit is done; the follow-up is its own booking.
        status:
          booking.status === 'follow_up_required'
            ? 'completed'
            : booking.status,
        photoCount: photos.length,
      }),
    );
  }

  private async findOwned(userId: string, id: number) {
    const booking = await this.bookings.findOne({
      where: { id, user: { id: userId } },
    });
    // Someone else's booking looks exactly like a missing one.
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  private assertNoPendingRequest(booking: Booking) {
    if (booking.rescheduleRequest || booking.cancellationRequest) {
      throw new ConflictException(
        'We are already reviewing a change to this booking.',
      );
    }
  }

  /** Asks to move a scheduled visit. The current schedule stands until the team confirms. */
  async requestReschedule(
    userId: string,
    id: number,
    preferredDate: string,
    preferredTime: (typeof TIME_SLOTS)[number],
  ) {
    const booking = await this.findOwned(userId, id);
    if (booking.status !== 'scheduled') {
      throw new ConflictException(
        'Only scheduled bookings can be rescheduled.',
      );
    }
    this.assertNoPendingRequest(booking);
    if (preferredDate < todayInWat()) {
      throw new BadRequestException(
        'Choose a preferred date from today onwards.',
      );
    }
    booking.rescheduleRequest = {
      preferredDate,
      preferredTime,
      requestedAt: new Date().toISOString(),
    };
    await this.bookings.update(booking.id, {
      rescheduleRequest: booking.rescheduleRequest,
    });
    void this.mail.bookingChangeRequested(booking, 'reschedule');
    return { reference: booking.reference };
  }

  /** Asks to cancel a booking that hasn't started yet. */
  async requestCancellation(userId: string, id: number, reason?: string) {
    const booking = await this.findOwned(userId, id);
    if (booking.status !== 'requested' && booking.status !== 'scheduled') {
      throw new ConflictException(
        'This booking can no longer be cancelled online. Please contact us.',
      );
    }
    this.assertNoPendingRequest(booking);
    booking.cancellationRequest = {
      reason: reason?.trim() || null,
      requestedAt: new Date().toISOString(),
    };
    await this.bookings.update(booking.id, {
      cancellationRequest: booking.cancellationRequest,
    });
    void this.mail.bookingChangeRequested(booking, 'cancellation');
    return { reference: booking.reference };
  }

  /** Streams one of the user's booking photos. */
  async openPhoto(userId: string, id: number, index: number) {
    const booking = await this.findOwned(userId, id);
    const photo = booking.photos[index];
    if (!photo) throw new NotFoundException('Photo not found.');
    const stream = await this.storage
      .get(`bookings/${photo.fileName}`, photo.storage)
      .catch(() => {
        throw new NotFoundException('Photo file is missing.');
      });
    return { photo, stream };
  }

  /**
   * Team-side changes until the admin exists (see scripts/update-booking.ts).
   * Moving to completed/closed stamps the date; confirming clears a pending request.
   */
  async updateByReference(reference: string, changes: BookingUpdate) {
    const booking = await this.bookings.findOne({ where: { reference } });
    if (!booking) throw new NotFoundException(`No booking ${reference}.`);

    const patch: Partial<Booking> = {};
    if (changes.confirmReschedule) {
      const request = booking.rescheduleRequest;
      if (!request) throw new BadRequestException('No reschedule request.');
      if (!changes.scheduledTime) {
        throw new BadRequestException(
          'Give the confirmed time (--time HH:MM) with the reschedule.',
        );
      }
      patch.scheduledDate = changes.scheduledDate ?? request.preferredDate;
      patch.rescheduleRequest = null;
    }
    if (changes.confirmCancellation) {
      if (!booking.cancellationRequest) {
        throw new BadRequestException('No cancellation request.');
      }
      patch.status = 'closed';
    }
    if (changes.declineRequest) {
      patch.rescheduleRequest = null;
      patch.cancellationRequest = null;
    }
    if (changes.status) patch.status = changes.status;
    if (changes.scheduledDate) patch.scheduledDate = changes.scheduledDate;
    if (changes.scheduledTime) patch.scheduledTime = changes.scheduledTime;
    if (changes.assignedFumigator !== undefined) {
      patch.assignedFumigator = changes.assignedFumigator || null;
    }
    if (patch.status === 'completed') patch.completedAt = new Date();
    if (patch.status === 'closed') {
      patch.closedAt = new Date();
      patch.rescheduleRequest = null;
      patch.cancellationRequest = null;
    }
    const next = Object.assign(booking, patch);
    if (
      next.status === 'scheduled' &&
      (!next.scheduledDate || !next.scheduledTime)
    ) {
      throw new BadRequestException(
        'A scheduled booking needs a date and time (--date and --time).',
      );
    }
    await this.bookings.update(booking.id, patch);
    return next;
  }
}

export type BookingUpdate = {
  status?: BookingStatus;
  scheduledDate?: string;
  scheduledTime?: string;
  assignedFumigator?: string;
  confirmReschedule?: boolean;
  confirmCancellation?: boolean;
  declineRequest?: boolean;
};
