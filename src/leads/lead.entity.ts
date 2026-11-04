import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Booking, type BookingPhoto } from '../bookings/booking.entity.js';
import { CONTACT_LOG_METHODS } from '../quote-requests/purchase-request-activity.entity.js';
import { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import { User } from '../users/user.entity.js';

/** `quoted`: a proforma was sent. `won`: converted to a job (or order). */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'quoted',
  'won',
  'lost',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Leads still being worked on. */
export const OPEN_LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'quoted'];

export const LEAD_SOURCES = ['service_booking', 'bulk_quote'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CONTACT_OUTCOMES = [
  'customer_reached',
  'no_response',
  'call_back_requested',
  'wrong_number',
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export const LOST_REASONS = [
  'customer_not_interested',
  'price_not_accepted',
  'unable_to_contact',
  'service_unavailable',
  'duplicate_enquiry',
  'other',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export type SurveyArea = {
  name: string;
  /** Metres. */
  length: number;
  width: number;
  condition: 'empty' | 'furnished';
  containsStock: boolean;
};

/** A site visit's findings, measurements and recommendations (feeds the proforma). */
export type SiteSurvey = {
  /** YYYY-MM-DD */
  date: string;
  surveyedBy: { id: string; fullName: string };
  pestsIdentified: string;
  findings: string;
  areas: SurveyArea[];
  /** m² */
  landArea: number | null;
  bushClearing: boolean;
  clearArea: number | null;
  entryPoints: number | null;
  baitStations: number | null;
  followUpVisits: number | null;
  recommendedTreatment: string;
  estimatedScope: string | null;
  photos: BookingPhoto[];
  recordedAt: string;
};

/**
 * A website enquiry being followed up: a service booking request or a bulk quote. The
 * enquiry itself stays in its own table; the lead tracks the sales work around it.
 */
@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn()
  id: number;

  /** Staff-facing reference, e.g. TX-LD-000123. */
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 20 })
  source: LeadSource;

  @Column({ type: 'varchar', length: 2 })
  country: 'NG' | 'BJ';

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: LeadStatus;

  @OneToOne(() => Booking, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn()
  booking: Relation<Booking> | null;

  @OneToOne(() => QuoteRequest, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn()
  quoteRequest: Relation<QuoteRequest> | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  assignedTo: User | null;

  @Column({ type: 'jsonb', nullable: true })
  survey: SiteSurvey | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  lostReason: LostReason | null;

  @Column({ type: 'text', nullable: true })
  lostNote: string | null;

  /** When the lead was won or lost. */
  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @OneToMany(() => LeadContact, (c) => c.lead)
  contacts: Relation<LeadContact[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** A logged call, WhatsApp, email or visit with the customer about a lead. */
@Entity('lead_contacts')
export class LeadContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Lead, (l) => l.contacts, { onDelete: 'CASCADE' })
  lead: Relation<Lead>;

  @Column({ type: 'varchar', length: 20 })
  method: (typeof CONTACT_LOG_METHODS)[number];

  @Column({ type: 'varchar', length: 30 })
  outcome: ContactOutcome;

  @Column({ type: 'timestamptz' })
  contactedAt: Date;

  @Column({ type: 'text' })
  note: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  loggedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
