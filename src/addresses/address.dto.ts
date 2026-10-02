import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ADDRESS_COUNTRIES } from './address.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AddressDto {
  @IsIn(ADDRESS_COUNTRIES)
  country: (typeof ADDRESS_COUNTRIES)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;
}
