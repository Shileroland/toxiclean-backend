import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
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
import {
  CATALOG_COUNTRIES,
  PRODUCT_AUDIENCES,
  PRODUCT_CATEGORIES,
} from './catalog.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;
const MAX_PRICE = 1_000_000_000;
export const MAX_SPECIFICATIONS = 20;
export const MAX_PRODUCT_IMAGES = 8;

export class BrandDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Multipart sends one value per field, so a single country arrives as a string. */
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || value === ''
      ? []
      : Array.isArray(value)
        ? value
        : [value],
  )
  @IsArray()
  @ArrayMaxSize(CATALOG_COUNTRIES.length)
  @IsIn(CATALOG_COUNTRIES, { each: true })
  countries: (typeof CATALOG_COUNTRIES)[number][];

  @Transform(emptyToNull)
  @IsOptional()
  @Matches(DATE, { message: 'agreementStart must be YYYY-MM-DD' })
  agreementStart?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @Matches(DATE, { message: 'agreementExpiry must be YYYY-MM-DD' })
  agreementExpiry?: string | null;

  /** Edit Brand: drops the stored agreement document. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  removeDocument?: boolean;
}

export class SpecificationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  value: string;
}

/** Add Product and Edit Product (the same fields; images and the MSDS upload separately). */
export class ProductDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,39}$/, {
    message: 'SKU can use letters, numbers and dashes (up to 40).',
  })
  sku: string;

  @IsIn(PRODUCT_CATEGORIES)
  category: (typeof PRODUCT_CATEGORIES)[number];

  /** A brand's id, or null with `unbranded` for none. */
  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsBoolean()
  unbranded?: boolean;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameFr?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionFr?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_AUDIENCES.length)
  @IsIn(PRODUCT_AUDIENCES, { each: true })
  audiences?: (typeof PRODUCT_AUDIENCES)[number][];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SPECIFICATIONS)
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  priceNgn?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  priceXof?: number | null;

  @IsOptional()
  @IsBoolean()
  rentable?: boolean;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  regulatoryAuthority?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string | null;
}

export class PrimaryImageDto {
  @IsInt()
  @Min(0)
  @Max(MAX_PRODUCT_IMAGES - 1)
  index: number;
}

export class SupplierDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsIn(CATALOG_COUNTRIES)
  country: (typeof CATALOG_COUNTRIES)[number];
}

export class ReceiveStockDto {
  @IsUUID()
  productId: string;

  @IsIn(CATALOG_COUNTRIES)
  country: (typeof CATALOG_COUNTRIES)[number];

  /** One of the country's branches. */
  @IsString()
  @MaxLength(60)
  location: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** Sets the location's reorder level when given. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  reorderLevel?: number | null;

  @IsUUID()
  supplierId: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierReference?: string | null;

  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  totalCost: number;
}

export class AdjustStockDto {
  @IsIn(CATALOG_COUNTRIES)
  country: (typeof CATALOG_COUNTRIES)[number];

  @IsString()
  @MaxLength(60)
  location: string;

  @IsIn(['add', 'deduct'])
  direction: 'add' | 'deduct';

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class ReorderLevelDto {
  @IsIn(CATALOG_COUNTRIES)
  country: (typeof CATALOG_COUNTRIES)[number];

  @IsString()
  @MaxLength(60)
  location: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  reorderLevel: number | null;
}
