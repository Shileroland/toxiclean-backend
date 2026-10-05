import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CONTACT_METHODS,
  COUNTRIES,
} from '../quote-requests/quote-request.entity.js';
import { CUSTOMER_TYPES } from './customer.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CustomerDto {
  @IsIn(CUSTOMER_TYPES)
  type: (typeof CUSTOMER_TYPES)[number];

  /** Full name, or the business name. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  /** E.164 format, e.g. +2348034567890. */
  @Matches(/^\+\d{7,15}$/, { message: 'phone must be in international format' })
  phone: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsIn(COUNTRIES)
  country: (typeof COUNTRIES)[number];

  @IsIn(CONTACT_METHODS)
  preferredContactMethod: (typeof CONTACT_METHODS)[number];
}

export class LocationDto {
  @IsIn(COUNTRIES)
  country: (typeof COUNTRIES)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;
}
