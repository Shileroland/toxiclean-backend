import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { bigintNumber } from '../database/transformers.js';
import { User } from '../users/user.entity.js';
import {
  PurchaseRequestContact,
  PurchaseRequestNote,
  PurchaseRequestPayment,
} from './purchase-request-activity.entity.js';

export type QuoteRequestItem = {
  productSlug: string;
  productName: string;
  quantity: number;
  /** Estimated unit price shown to the customer, in the request's currency (product requests only). */
  unitPrice?: number;
  /** Unit price agreed with the customer when staff confirmed the request. */
  agreedUnitPrice?: number;
};

/** `bulk`: the bulk quote form. `product`: checkout of the product request basket. */
export const REQUEST_KINDS = ['bulk', 'product'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** Prices are entered per currency (never converted); requests keep the one the customer saw. */
export const CURRENCIES = ['NGN', 'XOF'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const COUNTRIES = ['NG', 'BJ'] as const;
export const DELIVERY_METHODS = ['delivery', 'pickup'] as const;
export const CONTACT_METHODS = ['whatsapp', 'phone', 'email'] as const;
/**
 * requested (shown as "New") → contacted → confirmed (prices agreed) → payment_pending →
 * payment_received (paid in full) → processing → dispatched (delivery) or
 * ready_for_pickup (pickup) → completed. declined and cancelled end a request early.
 */
export const QUOTE_STATUSES = [
  'requested',
  'contacted',
  'confirmed',
  'payment_pending',
  'payment_received',
  'processing',
  'dispatched',
  'ready_for_pickup',
  'completed',
  'declined',
  'cancelled',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

@Entity('quote_requests')
export class QuoteRequest {
  @PrimaryGeneratedColumn()
  id: number;

  /** Customer-facing reference, e.g. TX-PR-000123. */
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 10, default: 'bulk' })
  kind: RequestKind;

  /** Currency of the items' unit prices. */
  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: Currency;

  @Column({ type: 'jsonb' })
  items: QuoteRequestItem[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  organisationName: string | null;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 2 })
  country: (typeof COUNTRIES)[number];

  @Column({ type: 'varchar', length: 20 })
  deliveryMethod: (typeof DELIVERY_METHODS)[number];

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tenderReference: string | null;

  @Column({ type: 'varchar', length: 20 })
  preferredContactMethod: (typeof CONTACT_METHODS)[number];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: QuoteStatus;

  /** Sum of the agreed prices, set when staff confirm the request. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  confirmedTotal: number | null;

  @Column({ type: 'text', nullable: true })
  declineReason: string | null;

  @OneToMany(() => PurchaseRequestPayment, (p) => p.request)
  payments: Relation<PurchaseRequestPayment[]>;

  @OneToMany(() => PurchaseRequestContact, (c) => c.request)
  contacts: Relation<PurchaseRequestContact[]>;

  @OneToMany(() => PurchaseRequestNote, (n) => n.request)
  internalNotes: Relation<PurchaseRequestNote[]>;

  /** Set when the request was submitted while signed in. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
