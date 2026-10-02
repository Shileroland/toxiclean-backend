import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PASSWORD_RULE } from '../../auth/crypto.js';
import { LANGUAGES, USER_COUNTRIES } from '../user.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @Matches(/^\+\d{7,15}$/, { message: 'Enter a valid phone number.' })
  phone: string;

  @IsOptional()
  @IsIn(USER_COUNTRIES)
  country?: (typeof USER_COUNTRIES)[number];
}

export class UpdateLanguageDto {
  @IsIn(LANGUAGES)
  language: (typeof LANGUAGES)[number];
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @Matches(PASSWORD_RULE, {
    message:
      'Use at least 8 characters, including a number and an uppercase letter.',
  })
  newPassword: string;
}
