import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { COUNTRIES } from '../quote-requests/quote-request.entity.js';
import { AVAILABILITIES, SKILLS, WEEKDAYS } from './fumigator.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const PHONE = /^\+\d{7,15}$/;
const PHONE_MESSAGE = 'phone must be in international format';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class FumigatorDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  /** E.164 format, e.g. +2348034567890. */
  @Matches(PHONE, { message: PHONE_MESSAGE })
  phone: string;

  @IsIn(COUNTRIES)
  country: (typeof COUNTRIES)[number];

  @Transform(lower)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  /** Checked against the country's branches by the service. */
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  branch?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SKILLS.length)
  @IsIn(SKILLS, { each: true })
  skills?: string[];

  @IsOptional()
  @IsIn(AVAILABILITIES)
  availability?: (typeof AVAILABILITIES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WEEKDAYS, { each: true })
  workingDays?: (typeof WEEKDAYS)[number][];

  @IsOptional()
  @Matches(TIME, { message: 'workStart must be HH:MM' })
  workStart?: string;

  @IsOptional()
  @Matches(TIME, { message: 'workEnd must be HH:MM' })
  workEnd?: string;
}

export class UpdateFumigatorDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @Matches(PHONE, { message: PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsIn(COUNTRIES)
  country?: (typeof COUNTRIES)[number];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @Transform(lower)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  branch?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SKILLS.length)
  @IsIn(SKILLS, { each: true })
  skills?: string[];

  @IsOptional()
  @IsIn(AVAILABILITIES)
  availability?: (typeof AVAILABILITIES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WEEKDAYS, { each: true })
  workingDays?: (typeof WEEKDAYS)[number][];

  @IsOptional()
  @Matches(TIME, { message: 'workStart must be HH:MM' })
  workStart?: string;

  @IsOptional()
  @Matches(TIME, { message: 'workEnd must be HH:MM' })
  workEnd?: string;
}

export class AvailabilityDto {
  @IsIn(AVAILABILITIES)
  availability: (typeof AVAILABILITIES)[number];
}

/** Sent as multipart form fields, with the document as an optional file. */
export class CertificateDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  issuingOrganisation: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificateNumber?: string;

  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'issueDate must be YYYY-MM-DD' })
  issueDate: string;

  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'expiryDate must be YYYY-MM-DD' })
  expiryDate: string;
}
