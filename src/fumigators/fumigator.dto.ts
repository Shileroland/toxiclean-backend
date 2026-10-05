import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { COUNTRIES } from '../quote-requests/quote-request.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const PHONE = /^\+\d{7,15}$/;
const PHONE_MESSAGE = 'phone must be in international format';

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
}
