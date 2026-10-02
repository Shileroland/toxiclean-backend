import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CONTACT_METHODS,
  COUNTRIES,
  CURRENCIES,
  DELIVERY_METHODS,
  REQUEST_KINDS,
} from '../quote-request.entity.js';

export class QuoteRequestItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  productSlug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName: string;

  @IsInt()
  @Min(1)
  @Max(9999)
  quantity: number;

  /** Estimated unit price shown in the basket, in `currency`; staff confirm the final price. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitPrice?: number;
}

export class CreateQuoteRequestDto {
  @IsOptional()
  @IsIn(REQUEST_KINDS)
  kind?: (typeof REQUEST_KINDS)[number];

  /** Currency of the unit prices; defaults to NGN. */
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteRequestItemDto)
  items: QuoteRequestItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organisationName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  /** E.164 format, e.g. +2349119537489. */
  @Matches(/^\+\d{7,15}$/, { message: 'phone must be in international format' })
  phone: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsIn(COUNTRIES)
  country: (typeof COUNTRIES)[number];

  @IsIn(DELIVERY_METHODS)
  deliveryMethod: (typeof DELIVERY_METHODS)[number];

  @ValidateIf((dto: CreateQuoteRequestDto) => dto.deliveryMethod === 'delivery')
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state?: string;

  @ValidateIf((dto: CreateQuoteRequestDto) => dto.deliveryMethod === 'delivery')
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city?: string;

  @ValidateIf((dto: CreateQuoteRequestDto) => dto.deliveryMethod === 'delivery')
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenderReference?: string;

  @IsIn(CONTACT_METHODS)
  preferredContactMethod: (typeof CONTACT_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
