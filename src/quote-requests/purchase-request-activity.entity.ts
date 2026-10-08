import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { bigintNumber } from '../database/transformers.js';
import { User } from '../users/user.entity.js';
import { QuoteRequest } from './quote-request.entity.js';

export const CONTACT_LOG_METHODS = [
  'phone',
  'whatsapp',
  'email',
  'in_person',
] as const;
export type ContactLogMethod = (typeof CONTACT_LOG_METHODS)[number];

export const PAYMENT_METHODS = [
  'bank_transfer',
  'cash',
  'pos',
  'mobile_money',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A payment received against a purchase request (partial payments allowed). */
@Entity('purchase_request_payments')
export class PurchaseRequestPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => QuoteRequest, (r) => r.payments, { onDelete: 'CASCADE' })
  request: Relation<QuoteRequest>;

  /** In the request's currency, whole units. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @Column({ type: 'date' })
  paidOn: string;

  /** The account the money went into, e.g. "GTBank, Nigeria". */
  @Column({ type: 'varchar', length: 120 })
  account: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** A logged call, WhatsApp or email with the customer. */
@Entity('purchase_request_contacts')
export class PurchaseRequestContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => QuoteRequest, (r) => r.contacts, { onDelete: 'CASCADE' })
  request: Relation<QuoteRequest>;

  @Column({ type: 'varchar', length: 20 })
  method: ContactLogMethod;

  @Column({ type: 'timestamptz' })
  contactedAt: Date;

  @Column({ type: 'text' })
  note: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  loggedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Staff-only note on a purchase request. */
@Entity('purchase_request_notes')
export class PurchaseRequestNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => QuoteRequest, (r) => r.internalNotes, {
    onDelete: 'CASCADE',
  })
  request: Relation<QuoteRequest>;

  @Column({ type: 'text' })
  body: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  author: User | null;

  /** Kept so the note still shows who wrote it if that account is removed. */
  @Column({ type: 'varchar', length: 200 })
  authorName: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
