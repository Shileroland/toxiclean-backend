import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Booking } from '../bookings/booking.entity.js';
import {
  StockMovement,
  type StoredFile,
  Supplier,
} from '../catalog/catalog.entity.js';
import { Customer } from '../customers/customer.entity.js';
import { bigintNumber, decimalNumber } from '../database/transformers.js';
import { Proforma } from '../proformas/proforma.entity.js';
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../quote-requests/purchase-request-activity.entity.js';
import { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import { type Language, User } from '../users/user.entity.js';

export { PAYMENT_METHODS, type PaymentMethod };

export const FINANCE_COUNTRIES = ['NG', 'BJ'] as const;
export type FinanceCountry = (typeof FINANCE_COUNTRIES)[number];

export const ACCOUNT_TYPES = ['bank', 'cash'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** A bank or cash account money is received into and paid from. */
@Entity('finance_accounts')
export class FinanceAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 10 })
  type: AccountType;

  @Column({ type: 'varchar', length: 2 })
  country: FinanceCountry;

  /** One of the country's BRANCHES. */
  @Column({ type: 'varchar', length: 60 })
  branch: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  accountNumber: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  accountHolder: string | null;

  /** The balance on `openingDate`; not income. Fixed once the account exists. */
  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  openingBalance: number;

  @Column({ type: 'date' })
  openingDate: string;

  /** Inactive accounts keep their history but can't take new transactions. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/**
 * One movement of an account's recorded balance: money in from income, money out for
 * an expense payment, either side of a transfer, or a balance adjustment.
 */
export const ENTRY_KINDS = [
  'income',
  'expense_payment',
  'transfer',
  'adjustment',
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

@Entity('account_entries')
export class AccountEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Generated('increment')
  number: number;

  @Index()
  @ManyToOne(() => FinanceAccount, { nullable: false, onDelete: 'CASCADE' })
  account: Relation<FinanceAccount>;

  @Column({ type: 'varchar', length: 20 })
  kind: EntryKind;

  /** Signed: positive is money in. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'date' })
  date: string;

  /** The source record's reference (PAY-…, EXP-…), or TRF-… / BAL-… for transfers and adjustments. */
  @Column({ type: 'varchar', length: 30 })
  reference: string;

  @Column({ type: 'varchar', length: 300 })
  description: string;

  /** Adjustments: why the balance was corrected. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @ManyToOne(() => Income, { nullable: true, onDelete: 'CASCADE' })
  income: Relation<Income> | null;

  @ManyToOne(() => ExpensePayment, { nullable: true, onDelete: 'CASCADE' })
  expensePayment: Relation<ExpensePayment> | null;

  /** The other account of a transfer. */
  @ManyToOne(() => FinanceAccount, { nullable: true, onDelete: 'SET NULL' })
  counterpart: Relation<FinanceAccount> | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: Relation<User> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** services: bookings and treatments; product_sales: purchase requests; other: anything else. */
export const INCOME_SOURCES = ['services', 'product_sales', 'other'] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

/** Money received (PAY-…): recorded by hand, or from a purchase request, proforma or invoice payment. */
@Entity('incomes')
export class Income {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Generated('increment')
  number: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 2 })
  country: FinanceCountry;

  @Column({ type: 'varchar', length: 60, nullable: true })
  branch: string | null;

  @Column({ type: 'varchar', length: 20 })
  source: IncomeSource;

  @Column({ type: 'varchar', length: 200 })
  receivedFrom: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  description: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  /** Where the money went; null when it was recorded against an account name we don't hold. */
  @ManyToOne(() => FinanceAccount, { nullable: true, onDelete: 'SET NULL' })
  account: Relation<FinanceAccount> | null;

  /** The account as written on the source payment, when it isn't one of ours. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  accountName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentReference: string | null;

  @ManyToOne(() => Invoice, (i) => i.payments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  invoice: Relation<Invoice> | null;

  @ManyToOne(() => QuoteRequest, { nullable: true, onDelete: 'SET NULL' })
  quoteRequest: Relation<QuoteRequest> | null;

  @ManyToOne(() => Proforma, { nullable: true, onDelete: 'SET NULL' })
  proforma: Relation<Proforma> | null;

  /** The purchase request / proforma payment this came from, so it's recorded once. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  sourcePayment: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: Relation<User> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

export const EXPENSE_CATEGORIES = [
  'inventory_purchase',
  'cost_of_goods_sold',
  'payroll',
  'rent_utilities',
  'transport',
  'marketing',
  'licensing_compliance',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const FREQUENCIES = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** A schedule that creates an unpaid expense each period, from `nextDate` until `endDate`. */
@Entity('recurring_expenses')
export class RecurringExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  frequency: Frequency;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'date' })
  startDate: string;

  /** Null: repeats until stopped. */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  /** When the next expense is due to be created. */
  @Column({ type: 'date' })
  nextDate: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @OneToMany(() => Expense, (e) => e.recurring)
  expenses: Relation<Expense[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** manual: Record Expense; inventory: a stock delivery's cost; recurring: from a schedule. */
export const EXPENSE_ORIGINS = ['manual', 'inventory', 'recurring'] as const;
export type ExpenseOrigin = (typeof EXPENSE_ORIGINS)[number];

/** A business cost (EXP-…), paid in one go or in parts. */
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Generated('increment')
  number: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 2 })
  country: FinanceCountry;

  @Column({ type: 'varchar', length: 60 })
  branch: string;

  @Column({ type: 'varchar', length: 200 })
  description: string;

  @Column({ type: 'varchar', length: 30 })
  category: ExpenseCategory;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'date' })
  date: string;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  supplier: Relation<Supplier> | null;

  /** Receipt or invoice, under `expenses/`. */
  @Column({ type: 'jsonb', nullable: true })
  document: StoredFile | null;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  origin: ExpenseOrigin;

  /** The stock delivery (GR-…) this is the cost of. */
  @ManyToOne(() => StockMovement, { nullable: true, onDelete: 'SET NULL' })
  stockMovement: Relation<StockMovement> | null;

  @ManyToOne(() => RecurringExpense, (r) => r.expenses, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  recurring: Relation<RecurringExpense> | null;

  @OneToMany(() => ExpensePayment, (p) => p.expense)
  payments: Relation<ExpensePayment[]>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: Relation<User> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('expense_payments')
export class ExpensePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Expense, (e) => e.payments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  expense: Relation<Expense>;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @ManyToOne(() => FinanceAccount, { nullable: true, onDelete: 'SET NULL' })
  account: Relation<FinanceAccount> | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: Relation<User> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

export type InvoiceItem = {
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
};

/** manual: Create Invoice; the others are raised from a job or a purchase request. */
export const INVOICE_SOURCES = [
  'manual',
  'service_booking',
  'product_purchase',
] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];

/** A customer invoice (TCL-INV-…); its payments are income records. */
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Generated('increment')
  number: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 2 })
  country: FinanceCountry;

  @Column({ type: 'varchar', length: 60 })
  branch: string;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  customer: Relation<Customer> | null;

  /** As billed, so the invoice doesn't change if the customer record does. */
  @Column({ type: 'varchar', length: 200 })
  customerName: string;

  /** "Attn: …": the person at the customer's organisation. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  attention: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  customerEmail: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  customerPhone: string | null;

  @Column({ type: 'varchar', length: 300, default: '' })
  billingAddress: string;

  @Column({ type: 'date' })
  issueDate: string;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  billingReference: string | null;

  @Column({ type: 'jsonb' })
  items: InvoiceItem[];

  @Column({ type: 'bigint', transformer: bigintNumber })
  subtotal: number;

  /** Percent, e.g. 7.5. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: decimalNumber,
  })
  taxRate: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  tax: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  total: number;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: InvoiceSource;

  /** Terms & Notes, one per line ("Delivery: Not included in this invoice."). */
  @Column({ type: 'text', default: '' })
  notes: string;

  /** Shows "Delivery: Invoiced separately" under the subtotal. */
  @Column({ type: 'boolean', default: false })
  deliveryInvoicedSeparately: boolean;

  /** The language the customer's copy is written in. */
  @Column({ type: 'varchar', length: 2, default: 'en' })
  language: Language;

  @ManyToOne(() => Booking, { nullable: true, onDelete: 'SET NULL' })
  booking: Relation<Booking> | null;

  @ManyToOne(() => QuoteRequest, { nullable: true, onDelete: 'SET NULL' })
  quoteRequest: Relation<QuoteRequest> | null;

  @ManyToOne(() => Proforma, { nullable: true, onDelete: 'SET NULL' })
  proforma: Relation<Proforma> | null;

  /** Set when staff mark it as shared with the customer. */
  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  /** Unguessable token for the customer's view link. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  shareToken: string;

  @OneToMany(() => Income, (i) => i.invoice)
  payments: Relation<Income[]>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: Relation<User> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
