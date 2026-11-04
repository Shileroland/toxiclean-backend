import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CURRENCIES } from '../../quote-requests/quote-request.entity.js';
import { SurveyAreaDto } from './admin-lead.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ProformaCustomerDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Matches(/^\+\d{7,15}$/, { message: 'phone must be in international format' })
  phone: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** Optional: bulk orders collected from the office may have none. */
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address: string = '';

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  billingAddress?: string | null;
}

export class ProformaTreatmentDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SurveyAreaDto)
  areas: SurveyAreaDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  landArea?: number | null;

  @IsBoolean()
  bushClearing: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  clearArea?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  entryPoints?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  baitStations?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  followUpVisits?: number | null;
}

export class ProformaLineDto {
  @IsIn(['indoor', 'outdoor', 'products'])
  section: 'indoor' | 'outdoor' | 'products';

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  description: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  detail?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  quantity: number;

  @IsIn(['m2', 'each'])
  unit: 'm2' | 'each';

  /** Whole naira / francs. */
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitRate: number;
}

export class ServicePlanDto {
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @IsInt()
  @Min(1)
  @Max(60)
  durationMonths: number;

  @IsInt()
  @Min(1)
  @Max(24)
  maintenanceIntervalMonths: number;

  @IsIn(['monthly', 'upfront'])
  billing: 'monthly' | 'upfront';

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  monthlyFee: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  maintenanceVisitFee: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  upfrontDiscountPercent: number;
}

/** How a bulk quotation's products reach the customer. */
export class ProformaFulfilmentDto {
  @IsIn(['delivery', 'pickup'])
  method: 'delivery' | 'pickup';

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;
}

/** Create Proforma / Save to Draft. `generate` finishes it (then it can be shared). */
export class ProformaDto {
  @ValidateNested()
  @Type(() => ProformaCustomerDto)
  customer: ProformaCustomerDto;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  serviceAddress: string;

  @IsIn(CURRENCIES)
  currency: (typeof CURRENCIES)[number];

  @IsIn(['en', 'fr'])
  language: 'en' | 'fr';

  @ValidateNested()
  @Type(() => ProformaTreatmentDto)
  treatment: ProformaTreatmentDto;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ProformaLineDto)
  lines: ProformaLineDto[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  depositPercent: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  paymentTerms?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'validUntil must be YYYY-MM-DD' })
  validUntil?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ServicePlanDto)
  servicePlan?: ServicePlanDto | null;

  /** Bulk quotations only. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ProformaFulfilmentDto)
  fulfilment?: ProformaFulfilmentDto | null;

  @IsOptional()
  @IsBoolean()
  generate?: boolean;
}

export const CUSTOMER_RESPONSES = [
  'accepted',
  'revision_requested',
  'declined',
] as const;

export class CustomerResponseDto {
  @IsIn(CUSTOMER_RESPONSES)
  response: (typeof CUSTOMER_RESPONSES)[number];

  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
