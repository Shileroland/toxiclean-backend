import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CONTACT_LOG_METHODS,
  PAYMENT_METHODS,
} from '../../quote-requests/purchase-request-activity.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class LogContactDto {
  @IsIn(CONTACT_LOG_METHODS)
  method: (typeof CONTACT_LOG_METHODS)[number];

  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** 24-hour HH:MM, West Africa Time. */
  @Matches(TIME, { message: 'time must be HH:MM' })
  time: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note: string;
}

export class ConfirmPricesDto {
  /** Agreed unit price for each requested item, in the same order as the items. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(1_000_000_000, { each: true })
  unitPrices: number[];
}

export class DeclineDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}

export class RecordPaymentDto {
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  amount: number;

  @IsIn(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'paidOn must be YYYY-MM-DD' })
  paidOn: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  account: string;
}

export class NoteDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}
