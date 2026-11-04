import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const PORTAL_TABS = ['today', 'upcoming', 'history'] as const;
export type PortalTab = (typeof PORTAL_TABS)[number];

export const MAX_CHEMICALS = 10;

export class ChemicalDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  product: string;

  /** Quantity or dosage, e.g. "2 litres" or "50ml per 10L". */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  quantity: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  applicationMethod: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  appliedBy: string;
}

/** Multipart fields of Complete Booking; `chemicals` arrives as a JSON string. */
export class CompleteBookingDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  treatmentPerformed: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  noChemicals?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return value; // Rejected by @IsArray.
      }
    }
    return Array.isArray(parsed)
      ? parsed.map((item: unknown) => plainToInstance(ChemicalDto, item))
      : parsed;
  })
  @IsArray()
  @ArrayMaxSize(MAX_CHEMICALS)
  @ValidateNested({ each: true })
  chemicals?: ChemicalDto[];
}
