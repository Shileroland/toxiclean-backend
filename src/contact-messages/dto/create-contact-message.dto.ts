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
} from '../../quote-requests/quote-request.entity.js';
import { CONTACT_TOPICS } from '../contact-message.entity.js';

export class CreateContactMessageDto {
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

  @IsIn(COUNTRIES)
  country: (typeof COUNTRIES)[number];

  @IsIn(CONTACT_TOPICS)
  topic: (typeof CONTACT_TOPICS)[number];

  @IsIn(CONTACT_METHODS)
  preferredContactMethod: (typeof CONTACT_METHODS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
