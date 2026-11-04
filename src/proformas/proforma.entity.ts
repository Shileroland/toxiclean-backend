import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { bigintNumber, decimalNumber } from '../database/transformers.js';
import { Lead, type SurveyArea } from '../leads/lead.entity.js';
import type { PaymentMethod } from '../quote-requests/purchase-request-activity.entity.js';
import type { Currency } from '../quote-requests/quote-request.entity.js';
import { User } from '../users/user.entity.js';
import type {
  PricedLine,
  ServicePlanInput,
  ServicePlanTotals,
} from './pricing.js';

/**
 * `ready`: generated, not yet shared. `superseded`: replaced by a later revision.
 * (accepted / revision_requested / declined come from the customer's response.)
 */
export const PROFORMA_STATUSES = [
  'draft',
  'ready',
  'sent',
  'accepted',
  'revision_requested',
  'declined',
  'superseded',
] as const;
export type ProformaStatus = (typeof PROFORMA_STATUSES)[number];

export type ProformaCustomer = {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxId: string | null;
  /** Set when billing goes to a different address. */
  billingAddress: string | null;
};

/** The measurements the charges were built from (from the survey, or entered by hand). */
export type ProformaTreatment = {
  areas: SurveyArea[];
  landArea: number | null;
  bushClearing: boolean;
  clearArea: number | null;
  entryPoints: number | null;
  baitStations: number | null;
  followUpVisits: number | null;
};

/** A quotation (proforma invoice) for a lead. Revisions share the reference. */
@Entity('proformas')
@Index(['reference', 'revision'], { unique: true })
export class Proforma {
  @PrimaryGeneratedColumn()
  id: number;

  /** e.g. TXC-NG-2026-001, numbered per country per year. */
  @Column({ type: 'varchar', length: 30 })
  reference: string;

  @Column({ type: 'int', default: 1 })
  revision: number;

  @Index()
  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  lead: Relation<Lead>;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ProformaStatus;

  @Column({ type: 'varchar', length: 2 })
  country: 'NG' | 'BJ';

  @Column({ type: 'varchar', length: 3 })
  currency: Currency;

  @Column({ type: 'varchar', length: 2, default: 'en' })
  language: 'en' | 'fr';

  @Column({ type: 'jsonb' })
  customer: ProformaCustomer;

  @Column({ type: 'varchar', length: 300 })
  serviceAddress: string;

  @Column({ type: 'jsonb' })
  treatment: ProformaTreatment;

  @Column({ type: 'jsonb' })
  lines: PricedLine[];

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: decimalNumber,
  })
  discountPercent: number;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: decimalNumber,
  })
  taxPercent: number;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: decimalNumber,
  })
  depositPercent: number;

  @Column({ type: 'text', nullable: true })
  paymentTerms: string | null;

  @Column({ type: 'date', nullable: true })
  validUntil: string | null;

  /** Bulk quotations: delivery to an address, or pickup from the office. */
  @Column({ type: 'jsonb', nullable: true })
  fulfilment: { method: 'delivery' | 'pickup'; address: string | null } | null;

  @Column({ type: 'jsonb', nullable: true })
  servicePlan: (ServicePlanInput & ServicePlanTotals) | null;

  @Column({ type: 'bigint', transformer: bigintNumber })
  subtotal: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  discountAmount: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  taxAmount: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  total: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  depositAmount: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy: User | null;

  /** Unguessable id in the customer's link (/proforma/<token>); set when generated. */
  @Column({ type: 'varchar', length: 64, unique: true, nullable: true })
  shareToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  /** When the customer accepted, asked for changes or declined (YYYY-MM-DD). */
  @Column({ type: 'date', nullable: true })
  responseDate: string | null;

  /** The requested changes, or the reason for declining. */
  @Column({ type: 'text', nullable: true })
  responseNote: string | null;

  @OneToMany(() => ProformaPayment, (p) => p.proforma)
  payments: Relation<ProformaPayment[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** A deposit (or later) payment received against an accepted proforma. */
@Entity('proforma_payments')
export class ProformaPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Proforma, (p) => p.payments, { onDelete: 'CASCADE' })
  proforma: Relation<Proforma>;

  /** In the proforma's currency, whole units. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @Column({ type: 'date' })
  paidOn: string;

  @Column({ type: 'varchar', length: 120 })
  account: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
