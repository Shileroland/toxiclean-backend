import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Customer } from '../customers/customer.entity.js';
import { Fumigator } from '../fumigators/fumigator.entity.js';
import type { StorageDriver } from '../storage/storage.service.js';
import { User } from '../users/user.entity.js';

export const PROPERTY_TYPES = [
  'residential',
  'commercial',
  'industrial',
] as const;
export const TIME_SLOTS = ['morning', 'afternoon', 'evening'] as const;
/**
 * requested: waiting for the team; scheduled: date and time agreed; on_the_way and
 * in_progress: on the day; completed: work done; follow_up_required: done, but another
 * visit is needed (see followUpReason); closed: cancelled or otherwise ended.
 */
export const BOOKING_STATUSES = [
  'requested',
  'scheduled',
  'on_the_way',
  'in_progress',
  'completed',
  'follow_up_required',
  'closed',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** A new date the customer asked for; the current schedule stands until confirmed. */
export type RescheduleRequest = {
  preferredDate: string;
  preferredTime: (typeof TIME_SLOTS)[number];
  requestedAt: string;
};

export type CancellationRequest = {
  reason: string | null;
  requestedAt: string;
};

/** A photo stored at `bookings/<fileName>` in local uploads or S3. Never served publicly. */
export type BookingPhoto = {
  fileName: string;
  /** Where the file lives; older rows without it are on local disk. */
  storage?: StorageDriver;
  originalName: string;
  mimeType: string;
  size: number;
};

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn()
  id: number;

  /** Customer-facing reference, e.g. TX-BK-000123. */
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: BookingStatus;

  /** Set when booked while signed in; kept if the account is deleted. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @Column({ type: 'varchar', length: 100 })
  serviceCategory: string;

  @Column({ type: 'varchar', length: 100 })
  serviceSlug: string;

  @Column({ type: 'varchar', length: 200 })
  serviceName: string;

  @Column({ type: 'varchar', length: 20 })
  propertyType: (typeof PROPERTY_TYPES)[number];

  @Column({ type: 'text' })
  issue: string;

  @Column({ type: 'jsonb', default: [] })
  photos: BookingPhoto[];

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  preferredContactMethod: string;

  @Column({ type: 'varchar', length: 2 })
  country: string;

  @Column({ type: 'varchar', length: 100 })
  state: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 300 })
  address: string;

  @Column({ type: 'date' })
  preferredDate: string;

  @Column({ type: 'varchar', length: 20 })
  preferredTime: (typeof TIME_SLOTS)[number];

  /** Set by the team once the visit is agreed. */
  @Column({ type: 'date', nullable: true })
  scheduledDate: string | null;

  /** 24-hour HH:MM, e.g. 10:00. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  scheduledTime: string | null;

  /** Last day of the visit; after scheduledDate for multi-day jobs. */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  /** 24-hour HH:MM when the work ends (on endDate). */
  @Column({ type: 'varchar', length: 5, nullable: true })
  endTime: string | null;

  /** Names of the assigned fumigators, as customers see them. Kept in step with `fumigators`. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  assignedFumigator: string | null;

  @ManyToMany(() => Fumigator)
  @JoinTable({ name: 'booking_fumigators' })
  fumigators: Fumigator[];

  /** Set once an admin has linked the booking to a customer record. */
  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  customer: Customer | null;

  /** Planned chemicals / treatment method (staff only). */
  @Column({ type: 'text', nullable: true })
  treatmentPlan: string | null;

  /** Why another visit is needed (status follow_up_required). */
  @Column({ type: 'text', nullable: true })
  followUpReason: string | null;

  /** The job this one follows up. */
  @ManyToOne(() => Booking, { nullable: true, onDelete: 'SET NULL' })
  followUpOf: Booking | null;

  @Column({ type: 'jsonb', nullable: true })
  rescheduleRequest: RescheduleRequest | null;

  @Column({ type: 'jsonb', nullable: true })
  cancellationRequest: CancellationRequest | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
