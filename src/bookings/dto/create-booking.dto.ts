import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CONTACT_METHODS,
  COUNTRIES,
} from '../../quote-requests/quote-request.entity.js';
import { PROPERTY_TYPES, TIME_SLOTS } from '../booking.entity.js';

/** Sent as multipart form fields alongside up to five `photos`. */
export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serviceCategory: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serviceSlug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  serviceName: string;

  @IsIn(PROPERTY_TYPES)
  propertyType: (typeof PROPERTY_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  issue: string;

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

  @IsIn(CONTACT_METHODS)
  preferredContactMethod: (typeof CONTACT_METHODS)[number];

  @IsIn(COUNTRIES)
  country: (typeof COUNTRIES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;

  /** YYYY-MM-DD; must not be in the past. */
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'preferredDate must be YYYY-MM-DD',
  })
  preferredDate: string;

  @IsIn(TIME_SLOTS)
  preferredTime: (typeof TIME_SLOTS)[number];
}
