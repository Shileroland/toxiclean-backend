import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PROPERTY_TYPES } from '../../bookings/booking.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Multipart sends one value as a string and several as an array; JSON may send either. */
const toArray = ({ value }: { value: unknown }) =>
  value === undefined || value === ''
    ? []
    : Array.isArray(value)
      ? value
      : [value];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleDto {
  /** First day, YYYY-MM-DD. */
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** 24-hour HH:MM. */
  @Matches(TIME, { message: 'startTime must be HH:MM' })
  startTime: string;

  /** Last day for multi-day jobs; defaults to `date`. */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  @Matches(TIME, { message: 'endTime must be HH:MM' })
  endTime: string;

  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  fumigatorIds: string[];
}

export const ADMIN_STATUS_CHANGES = [
  'on_the_way',
  'in_progress',
  'completed',
  'closed',
] as const;

export class StatusDto {
  @IsIn(ADMIN_STATUS_CHANGES)
  status: (typeof ADMIN_STATUS_CHANGES)[number];
}

export class FollowUpRequiredDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}

export class FumigatorsDto {
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  fumigatorIds: string[];
}

export class TreatmentPlanDto {
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  treatmentPlan: string;
}

/** Sent as multipart form fields alongside up to five `photos`. */
export class AdminCreateBookingDto extends ScheduleDto {
  @IsUUID()
  customerId: string;

  @IsUUID()
  locationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serviceCategory: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serviceSlug: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  serviceName: string;

  @IsIn(PROPERTY_TYPES)
  propertyType: (typeof PROPERTY_TYPES)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  issue?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  treatmentPlan?: string;
}
