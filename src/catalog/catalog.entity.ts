import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import type { StorageDriver } from '../storage/storage.service.js';
import { User } from '../users/user.entity.js';

export const PRODUCT_CATEGORIES = [
  'equipment',
  'chemicals',
  'spare_parts',
  'safety_equipment',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Who the shop lists a product for (its "Suitable For" filter). */
export const PRODUCT_AUDIENCES = [
  'agriculture',
  'pest_control_operators',
  'facilities_institutions',
] as const;
export type ProductAudience = (typeof PRODUCT_AUDIENCES)[number];

export const CATALOG_COUNTRIES = ['NG', 'BJ'] as const;
export type CatalogCountry = (typeof CATALOG_COUNTRIES)[number];

/** An uploaded file (image, PDF) in local uploads or S3, under the folder its owner uses. */
export type StoredFile = {
  fileName: string;
  storage?: StorageDriver;
  originalName: string;
  mimeType: string;
  size: number;
};

/** A brand Toxiclean distributes, and the countries it may sell it in. */
@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Countries Toxiclean is authorised to distribute the brand in. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  countries: CatalogCountry[];

  @Column({ type: 'date', nullable: true })
  agreementStart: string | null;

  @Column({ type: 'date', nullable: true })
  agreementExpiry: string | null;

  /** The distribution agreement (PDF or image), stored under `brands/`. */
  @Column({ type: 'jsonb', nullable: true })
  agreementDocument: StoredFile | null;

  @OneToMany(() => Product, (p) => p.brand)
  products: Relation<Product[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

export type Specification = { label: string; value: string };

/** A catalog product. Prices are entered per currency, never converted. */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** URL name on the shop, and what purchase request items refer to. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  slug: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  sku: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 30 })
  category: ProductCategory;

  /** Null with `unbranded` false means no brand has been assigned yet. */
  @ManyToOne(() => Brand, (b) => b.products, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  brand: Relation<Brand> | null;

  @Column({ type: 'boolean', default: false })
  unbranded: boolean;

  /** The name on the French site; the English name when null. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  nameFr: string | null;

  @Column({ type: 'text', default: '' })
  description: string;

  /** The description on the French site; the English one when empty. */
  @Column({ type: 'text', default: '' })
  descriptionFr: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  audiences: ProductAudience[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  specifications: Specification[];

  /** Stored under `products/`; the first is the primary image. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  images: StoredFile[];

  /** Whole naira; null when not sold in Nigeria yet ("Not Set"). */
  @Column({ type: 'integer', nullable: true })
  priceNgn: number | null;

  /** Whole CFA francs; null when not sold in Benin yet. */
  @Column({ type: 'integer', nullable: true })
  priceXof: number | null;

  @Column({ type: 'boolean', default: false })
  rentable: boolean;

  /** Chemicals only: e.g. NAFDAC. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  regulatoryAuthority: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  registrationNumber: string | null;

  /** Chemicals only: the manufacturer's safety data sheet (MSDS), under `products/`. */
  @Column({ type: 'jsonb', nullable: true })
  safetyDataSheet: StoredFile | null;

  @OneToMany(() => StockLevel, (s) => s.product)
  stock: Relation<StockLevel[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** A company Toxiclean buys stock from. */
@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 2 })
  country: CatalogCountry;

  @Column({ type: 'varchar', length: 200, nullable: true })
  contactPerson: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/**
 * A product's stock at one location (a branch, e.g. "Ikeja Branch"). Reserved units are
 * held for confirmed purchase requests; available = on hand − reserved.
 */
@Entity('stock_levels')
@Unique(['product', 'location'])
export class StockLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (p) => p.stock, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  product: Relation<Product>;

  @Column({ type: 'varchar', length: 2 })
  country: CatalogCountry;

  /** One of the country's BRANCHES. */
  @Column({ type: 'varchar', length: 60 })
  location: string;

  @Column({ type: 'integer', default: 0 })
  onHand: number;

  @Column({ type: 'integer', default: 0 })
  reserved: number;

  /** Low-stock alert at or below this many available units; null for no alert. */
  @Column({ type: 'integer', nullable: true })
  reorderLevel: number | null;
}

/**
 * received: delivery from a supplier (GR-…); adjustment: a count correction (ADJ-…);
 * reserved / released: held for or let go by a purchase request; issued: handed over
 * for a purchase request (leaves stock on hand).
 */
export const MOVEMENT_TYPES = [
  'received',
  'issued',
  'reserved',
  'released',
  'adjustment',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Numbers GR-/ADJ- references. */
  @Column({ type: 'integer' })
  @Generated('increment')
  number: number;

  /** GR-2026-014, ADJ-2026-008, or the purchase request's reference. */
  @Column({ type: 'varchar', length: 30 })
  reference: string;

  @Column({ type: 'varchar', length: 20 })
  type: MovementType;

  @Index()
  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  product: Relation<Product>;

  @Column({ type: 'varchar', length: 2 })
  country: CatalogCountry;

  @Column({ type: 'varchar', length: 60 })
  location: string;

  /** Signed change to stock on hand (or to reserved, for reserved/released). */
  @Column({ type: 'integer' })
  quantity: number;

  /** When it happened (e.g. the date received), YYYY-MM-DD. */
  @Column({ type: 'date' })
  date: string;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  supplier: Relation<Supplier> | null;

  /** The supplier's invoice or delivery note number. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  supplierReference: string | null;

  /** What the supplier charged for the delivery, in the country's currency. */
  @Column({ type: 'integer', nullable: true })
  totalCost: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @ManyToOne(() => QuoteRequest, { nullable: true, onDelete: 'SET NULL' })
  quoteRequest: Relation<QuoteRequest> | null;

  /** Null when the system recorded it (purchase request changes). */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  recordedBy: Relation<User> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
