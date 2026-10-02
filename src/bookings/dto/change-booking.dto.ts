import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TIME_SLOTS } from '../booking.entity.js';

export class RescheduleBookingDto {
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'preferredDate must be YYYY-MM-DD',
  })
  preferredDate: string;

  @IsIn(TIME_SLOTS)
  preferredTime: (typeof TIME_SLOTS)[number];
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
