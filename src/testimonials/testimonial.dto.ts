import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TESTIMONIAL_SEGMENTS } from './testimonial.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const MAX_QUOTE_LENGTH = 600;

/** Add Testimonial and Edit Testimonial (the photo uploads separately). */
export class TestimonialDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  authorName: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  authorRole?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  authorRoleFr?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @IsIn(TESTIMONIAL_SEGMENTS)
  segment: (typeof TESTIMONIAL_SEGMENTS)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_QUOTE_LENGTH)
  quote: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_QUOTE_LENGTH)
  quoteFr?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class TestimonialVisibilityDto {
  @IsBoolean()
  published: boolean;
}

export class TestimonialMoveDto {
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}
