import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

export type QuoteRequestItem = {
  productSlug: string;
  productName: string;
  quantity: number;
  /** Estimated unit price shown to the customer, in the request's currency (product requests only). */
  unitPrice?: number;
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
export const QUOTE_STATUSES = [
  'requested',
  'contacted',
  'confirmed',
  'processing',
  'ready',
  'completed',
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

  /** Set when the request was submitted while signed in. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
