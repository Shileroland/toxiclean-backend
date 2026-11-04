import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ACCOUNT_TYPES,
  EXPENSE_CATEGORIES,
  FINANCE_COUNTRIES,
  FREQUENCIES,
  INCOME_SOURCES,
  PAYMENT_METHODS,
} from './finance.entity.js';
import { LANGUAGES } from '../users/user.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 100_000_000_000;

export class AccountDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(ACCOUNT_TYPES)
  type: (typeof ACCOUNT_TYPES)[number];

  @IsIn(FINANCE_COUNTRIES)
  country: (typeof FINANCE_COUNTRIES)[number];

  @IsString()
  @MaxLength(60)
  branch: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountNumber?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountHolder?: string | null;

  @IsInt()
  @Min(-MAX_AMOUNT)
  @Max(MAX_AMOUNT)
  openingBalance: number;

  @Matches(DATE, { message: 'openingDate must be YYYY-MM-DD' })
  openingDate: string;
}

/** Edit Account: everything but the country and the opening balance. */
export class UpdateAccountDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(ACCOUNT_TYPES)
  type: (typeof ACCOUNT_TYPES)[number];

  @IsString()
  @MaxLength(60)
  branch: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountNumber?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountHolder?: string | null;

  @IsBoolean()
  active: boolean;
}

export class AdjustBalanceDto {
  @IsIn(['increase', 'decrease'])
  direction: 'increase' | 'decrease';

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class TransferDto {
  @IsUUID()
  fromId: string;

  @IsUUID()
  toId: string;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;
}

/** Record Income: money received outside bookings, purchases and invoices. */
export class IncomeDto {
  @IsIn(INCOME_SOURCES)
  source: (typeof INCOME_SOURCES)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  receivedFrom: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsIn(FINANCE_COUNTRIES)
  country: (typeof FINANCE_COUNTRIES)[number];

  @IsString()
  @MaxLength(60)
  branch: string;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsIn(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @IsUUID()
  accountId: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string | null;
}

export class ExpensePaymentDto {
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsIn(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @IsUUID()
  accountId: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string | null;
}

export class RecurrenceDto {
  @IsIn(FREQUENCIES)
  frequency: (typeof FREQUENCIES)[number];

  /** Null or left out: repeats until stopped. */
  @IsOptional()
  @Matches(DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string | null;
}

/** Manage Recurrence: the amount and schedule of future expenses. */
export class UpdateRecurrenceDto extends RecurrenceDto {
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;
}

/** Record Expense; the supporting document uploads separately. */
export class ExpenseDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @IsIn(EXPENSE_CATEGORIES)
  category: (typeof EXPENSE_CATEGORIES)[number];

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsIn(FINANCE_COUNTRIES)
  country: (typeof FINANCE_COUNTRIES)[number];

  @IsString()
  @MaxLength(60)
  branch: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  /** "Has a payment been made?" Yes: the first payment. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpensePaymentDto)
  payment?: ExpensePaymentDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;
}

/** Vendors & Suppliers: add or edit a supplier's details. */
export class VendorDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsIn(FINANCE_COUNTRIES)
  country: (typeof FINANCE_COUNTRIES)[number];

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string | null;

  @IsOptional()
  @Matches(/^\+\d{7,15}$/, { message: 'phone must be in international format' })
  phone?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class InvoiceItemDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  quantity: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string | null;

  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  unitPrice: number;
}

export class InvoiceDto {
  @IsUUID()
  customerId: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  billingAddress?: string;

  @IsIn(FINANCE_COUNTRIES)
  country: (typeof FINANCE_COUNTRIES)[number];

  @IsString()
  @MaxLength(60)
  branch: string;

  @Matches(DATE, { message: 'issueDate must be YYYY-MM-DD' })
  issueDate: string;

  @Matches(DATE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingReference?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  /** "Attn: …" under the customer's name. */
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  attention?: string | null;

  /** Terms & Notes, one per line; the standard notes when left out. */
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  deliveryInvoicedSeparately?: boolean;

  /** Adds the country's VAT; invoices carry no tax unless this is set. */
  @IsOptional()
  @IsBoolean()
  applyTax?: boolean;

  /** The invoice's language; defaults to the country's (French in Benin). */
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: (typeof LANGUAGES)[number];
}

/** Edit an invoice's Terms & Notes (any invoice, including the system's). */
export class InvoiceNotesDto {
  @IsString()
  @MaxLength(3000)
  notes: string;

  @IsOptional()
  @IsBoolean()
  deliveryInvoicedSeparately?: boolean;
}

/** Record Payment on an invoice: an income record linked to it. */
export class InvoicePaymentDto {
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsIn(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @IsUUID()
  accountId: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string | null;
}
