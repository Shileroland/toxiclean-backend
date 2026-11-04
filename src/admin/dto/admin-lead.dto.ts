import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONTACT_OUTCOMES, LOST_REASONS } from '../../leads/lead.entity.js';
import { CONTACT_LOG_METHODS } from '../../quote-requests/purchase-request-activity.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AssignLeadDto {
  @IsUUID()
  userId: string;
}

export class LogLeadContactDto {
  @IsIn(CONTACT_LOG_METHODS)
  method: (typeof CONTACT_LOG_METHODS)[number];

  @IsIn(CONTACT_OUTCOMES)
  outcome: (typeof CONTACT_OUTCOMES)[number];

  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** 24-hour HH:MM, West Africa Time. */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be HH:MM' })
  time: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note: string;
}

export class MarkLeadLostDto {
  @IsIn(LOST_REASONS)
  reason: (typeof LOST_REASONS)[number];

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class SurveyAreaDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Metres, up to two decimals. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000)
  length: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000)
  width: number;

  @IsIn(['empty', 'furnished'])
  condition: 'empty' | 'furnished';

  @IsBoolean()
  containsStock: boolean;
}

export class SiteSurveyDto {
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** A staff member. */
  @IsUUID()
  surveyedById: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  pestsIdentified: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  findings: string;

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

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  recommendedTreatment: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  estimatedScope?: string | null;
}
