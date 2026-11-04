import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { todayInWat } from '../bookings/bookings.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  type BrandDto,
  MAX_PRODUCT_IMAGES,
  type ProductDto,
} from './catalog.dto.js';
import {
  Brand,
  CATALOG_COUNTRIES,
  type CatalogCountry,
  Product,
  type ProductCategory,
  type StoredFile,
} from './catalog.entity.js';
import { fileInfo, storeCatalogFile, type Upload } from './file-storage.js';
import {
  branchesOf,
  InventoryService,
  PAGE_SIZE,
  summarise,
} from './inventory.service.js';

/** The shop marks products added within this many days as new. */
export const NEW_PRODUCT_DAYS = 30;

/** Agreements ending within this many days are "expiring soon". */
export const EXPIRING_DAYS = 30;

export const AGREEMENT_STATUSES = [
  'active',
  'expiring',
  'expired',
  'not_recorded',
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function agreementStatus(
  expiry: string | null,
  today = todayInWat(),
): AgreementStatus {
  if (!expiry) return 'not_recorded';
  if (expiry < today) return 'expired';
  if (expiry <= addDays(today, EXPIRING_DAYS)) return 'expiring';
  return 'active';
}

const escapeLike = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** "Solo Pressure Sprayer (5L)" → "solo-pressure-sprayer-5l" */
export const slugify = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'product';

const isUniqueViolation = (err: unknown) =>
  err instanceof QueryFailedError &&
  (err.driverError as { code?: string }).code === '23505';

/** What admin screens see of an image: its position and public URL key. */
const imageOf = (f: StoredFile, index: number) => ({
  index,
  fileName: f.fileName,
  originalName: f.originalName,
  primary: index === 0,
});

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly inventory: InventoryService,
    private readonly storage: StorageService,
  ) {}

  // ---- Brands ----

  private brandRow(b: Brand, productCount: number, today: string) {
    return {
      id: b.id,
      name: b.name,
      countries: b.countries,
      agreementStart: b.agreementStart,
      agreementExpiry: b.agreementExpiry,
      status: agreementStatus(b.agreementExpiry, today),
      productCount,
    };
  }

  async brandPage({
    q,
    countries,
    statuses,
    page,
  }: {
    q?: string;
    countries?: CatalogCountry[];
    statuses?: AgreementStatus[];
    page: number;
  }) {
    const today = todayInWat();
    const query = this.brands.createQueryBuilder('b').orderBy('b.name');
    if (q) query.where('b.name ILIKE :like', { like: escapeLike(q) });
    const [all, counts] = await Promise.all([
      query.getMany(),
      this.products
        .createQueryBuilder('p')
        .select('p."brandId"', 'id')
        .addSelect('COUNT(*)', 'count')
        .where('p."brandId" IS NOT NULL')
        .groupBy('p."brandId"')
        .getRawMany<{ id: string; count: string }>(),
    ]);
    const countOf = (id: string) =>
      Number(counts.find((c) => c.id === id)?.count ?? 0);
    const rows = all
      .map((b) => this.brandRow(b, countOf(b.id), today))
      .filter(
        (b) =>
          (!countries?.length ||
            countries.some((c) => b.countries.includes(c))) &&
          (!statuses?.length || statuses.includes(b.status)),
      );
    return {
      items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total: rows.length,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** For the product form's brand picker. */
  brandOptions() {
    return this.brands.find({
      select: { id: true, name: true, countries: true },
      order: { name: 'ASC' },
    });
  }

  private async findBrand(id: string) {
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found.');
    return brand;
  }

  async brandDetails(id: string) {
    const brand = await this.findBrand(id);
    const products = await this.products.find({
      where: { brand: { id } },
      select: { id: true, name: true, sku: true },
      order: { name: 'ASC' },
    });
    return {
      ...this.brandRow(brand, products.length, todayInWat()),
      agreementDocument: fileInfo(brand.agreementDocument),
      products,
    };
  }

  private checkDates(start?: string | null, expiry?: string | null) {
    if (start && expiry && expiry <= start) {
      throw new BadRequestException(
        'The agreement must expire after it starts.',
      );
    }
  }

  /** Saves the brand; if that fails, removes a document stored for it in this request. */
  private async saveBrand(brand: Brand, newDocument?: StoredFile | null) {
    try {
      return await this.brands.save(brand);
    } catch (err) {
      if (newDocument) {
        await this.removeFile(`brands/${newDocument.fileName}`, newDocument);
      }
      if (isUniqueViolation(err)) {
        throw new ConflictException('A brand with this name already exists.');
      }
      throw err;
    }
  }

  async createBrand(dto: BrandDto, document?: Upload) {
    this.checkDates(dto.agreementStart, dto.agreementExpiry);
    const agreementDocument = document
      ? await storeCatalogFile(document, this.storage, 'brands', {
          noun: 'agreement document',
        })
      : null;
    const brand = await this.saveBrand(
      this.brands.create({
        name: dto.name,
        countries: [...new Set(dto.countries)],
        agreementStart: dto.agreementStart || null,
        agreementExpiry: dto.agreementExpiry || null,
        agreementDocument,
      }),
      agreementDocument,
    );
    return this.brandDetails(brand.id);
  }

  /** `removeDocument` drops the stored agreement; a new `document` replaces it. */
  async updateBrand(
    id: string,
    dto: BrandDto,
    document?: Upload,
    removeDocument = false,
  ) {
    const brand = await this.findBrand(id);
    this.checkDates(dto.agreementStart, dto.agreementExpiry);
    const old = brand.agreementDocument;
    if (document) {
      brand.agreementDocument = await storeCatalogFile(
        document,
        this.storage,
        'brands',
        { noun: 'agreement document' },
      );
    } else if (removeDocument) {
      brand.agreementDocument = null;
    }
    brand.name = dto.name;
    brand.countries = [...new Set(dto.countries)];
    brand.agreementStart = dto.agreementStart || null;
    brand.agreementExpiry = dto.agreementExpiry || null;
    await this.saveBrand(brand, document ? brand.agreementDocument : null);
    if (old && old !== brand.agreementDocument) {
      await this.storage
        .delete(`brands/${old.fileName}`, old.storage)
        .catch(() => {});
    }
    return this.brandDetails(id);
  }

  async openBrandDocument(id: string) {
    const { agreementDocument: doc } = await this.findBrand(id);
    if (!doc) throw new NotFoundException('No agreement document.');
    return {
      file: doc,
      stream: await this.open(`brands/${doc.fileName}`, doc),
    };
  }

  // ---- Products ----

  /** The licensed countries a product inherits from its brand (null: not recorded). */
  private licensed(p: Product) {
    return p.brand ? p.brand.countries : null;
  }

  private brandLabel(p: Product) {
    return p.brand?.name ?? (p.unbranded ? 'Unbranded' : null);
  }

  /** The Products tab, with each product's available stock in the country. */
  async productPage({
    country,
    location,
    q,
    categories,
    page,
  }: {
    country: CatalogCountry;
    location?: string;
    q?: string;
    categories?: ProductCategory[];
    page: number;
  }) {
    if (location && !branchesOf(country).includes(location)) {
      throw new BadRequestException('Choose one of the country’s branches.');
    }
    const query = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.brand', 'b')
      .orderBy('p.name')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (q) {
      query.where('(p.name ILIKE :like OR p.sku ILIKE :like)', {
        like: escapeLike(q),
      });
    }
    if (categories?.length) {
      query.andWhere('p.category IN (:...categories)', { categories });
    }
    const [rows, total] = await query.getManyAndCount();
    const levels = await this.inventory.stockFor(
      rows.map((p) => p.id),
      country,
    );
    const locations = location ? [location] : branchesOf(country);
    return {
      items: rows.map((p) => {
        const stock = summarise(
          levels.filter((l) => l.product.id === p.id),
          locations,
        );
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          brand: this.brandLabel(p),
          price: country === 'NG' ? p.priceNgn : p.priceXof,
          available: stock.available,
          stockStatus: stock.status,
          licensedCountries: this.licensed(p),
        };
      }),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** For pickers (Receive Stock, the field portal's chemicals). */
  productOptions(category?: ProductCategory) {
    return this.products.find({
      select: { id: true, name: true, sku: true, category: true },
      where: category ? { category } : {},
      order: { name: 'ASC' },
    });
  }

  private async findProduct(id: string) {
    const product = await this.products.findOne({
      where: { id },
      relations: { brand: true },
    });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  /** Product Details: everything about the product, plus its stock in the country. */
  async productDetails(id: string, country: CatalogCountry) {
    const { product: p, stock } = await this.inventory.details(id, country);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      sku: p.sku,
      category: p.category,
      brand: p.brand && { id: p.brand.id, name: p.brand.name },
      brandLabel: this.brandLabel(p),
      unbranded: p.unbranded,
      licensedCountries: this.licensed(p),
      nameFr: p.nameFr,
      description: p.description,
      descriptionFr: p.descriptionFr,
      audiences: p.audiences,
      specifications: p.specifications,
      images: p.images.map(imageOf),
      priceNgn: p.priceNgn,
      priceXof: p.priceXof,
      rentable: p.rentable,
      regulatoryAuthority: p.regulatoryAuthority,
      registrationNumber: p.registrationNumber,
      safetyDataSheet: fileInfo(p.safetyDataSheet),
      stock,
    };
  }

  // ---- Shop ----

  /**
   * Where the shop sells a product: countries it has a price in and, when its brand
   * records licensed countries, that the brand is licensed in.
   */
  private shopCountries(p: Product): CatalogCountry[] {
    const licensed = p.brand?.countries ?? [];
    return CATALOG_COUNTRIES.filter(
      (c) =>
        (c === 'NG' ? p.priceNgn : p.priceXof) !== null &&
        (!licensed.length || licensed.includes(c)),
    );
  }

  /** The public catalog: only what is sold somewhere. */
  async shopProducts() {
    const rows = (
      await this.products.find({
        relations: { brand: true },
        order: { name: 'ASC' },
      })
    )
      .map((p) => ({ p, countries: this.shopCountries(p) }))
      .filter((r) => r.countries.length);
    const ids = rows.map((r) => r.p.id);
    const levels = (
      await Promise.all(
        CATALOG_COUNTRIES.map((c) => this.inventory.stockFor(ids, c)),
      )
    ).flat();
    const newSince = Date.now() - NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
    return rows.map(({ p, countries }) => ({
      slug: p.slug,
      name: p.name,
      nameFr: p.nameFr,
      category: p.category,
      brand: p.brand?.name ?? null,
      description: p.description,
      descriptionFr: p.descriptionFr,
      audiences: p.audiences,
      specifications: p.specifications,
      images: p.images.map((i) => i.fileName),
      prices: {
        ...(countries.includes('NG') && { NGN: p.priceNgn }),
        ...(countries.includes('BJ') && { XOF: p.priceXof }),
      },
      availableIn: countries,
      inStockIn: countries.filter((c) =>
        levels.some(
          (l) =>
            l.product.id === p.id && l.country === c && l.onHand > l.reserved,
        ),
      ),
      isNew: p.createdAt.getTime() >= newSince,
    }));
  }

  private async brandFor(dto: ProductDto) {
    if (!dto.brandId) return null;
    return this.findBrand(dto.brandId);
  }

  /** Brand, chemical-only fields and prices from the form. */
  private async fields(dto: ProductDto) {
    const chemical = dto.category === 'chemicals';
    const brand = await this.brandFor(dto);
    return {
      name: dto.name,
      sku: dto.sku,
      category: dto.category,
      brand,
      unbranded: !brand && Boolean(dto.unbranded),
      nameFr: dto.nameFr || null,
      description: dto.description ?? '',
      descriptionFr: dto.descriptionFr ?? '',
      audiences: [...new Set(dto.audiences ?? [])],
      specifications: (dto.specifications ?? []).map((s) => ({
        label: s.label,
        value: s.value,
      })),
      priceNgn: dto.priceNgn ?? null,
      priceXof: dto.priceXof ?? null,
      rentable: Boolean(dto.rentable),
      regulatoryAuthority: chemical ? dto.regulatoryAuthority || null : null,
      registrationNumber: chemical ? dto.registrationNumber || null : null,
    };
  }

  private async saveProduct(product: Product) {
    try {
      return await this.products.save(product);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A product with this SKU already exists.');
      }
      throw err;
    }
  }

  /** A slug not used by another product: "name", then "name-2", "name-3", … */
  private async freeSlug(name: string, exceptId?: string) {
    const base = slugify(name);
    const taken = await this.products
      .createQueryBuilder('p')
      .select(['p.id', 'p.slug'])
      .where('p.slug = :base OR p.slug LIKE :prefix', {
        base,
        prefix: `${base}-%`,
      })
      .getMany();
    const used = new Set(
      taken.filter((p) => p.id !== exceptId).map((p) => p.slug),
    );
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  async createProduct(dto: ProductDto, country: CatalogCountry) {
    const fields = await this.fields(dto);
    const product = await this.saveProduct(
      this.products.create({ ...fields, slug: await this.freeSlug(dto.name) }),
    );
    return this.productDetails(product.id, country);
  }

  /** The slug stays as it was, so shop links and purchase requests keep working. */
  async updateProduct(id: string, dto: ProductDto, country: CatalogCountry) {
    const product = await this.findProduct(id);
    Object.assign(product, await this.fields(dto));
    if (product.category !== 'chemicals' && product.safetyDataSheet) {
      await this.removeFile(
        `products/${product.safetyDataSheet.fileName}`,
        product.safetyDataSheet,
      );
      product.safetyDataSheet = null;
    }
    await this.saveProduct(product);
    return this.productDetails(id, country);
  }

  async addImages(id: string, files: Upload[], country: CatalogCountry) {
    const product = await this.findProduct(id);
    if (product.images.length + files.length > MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(
        `A product can have up to ${MAX_PRODUCT_IMAGES} images.`,
      );
    }
    const stored: StoredFile[] = [];
    for (const file of files) {
      stored.push(
        await storeCatalogFile(file, this.storage, 'products', {
          images: true,
          noun: 'image',
        }),
      );
    }
    await this.products.update(id, { images: [...product.images, ...stored] });
    return this.productDetails(id, country);
  }

  async removeImage(id: string, index: number, country: CatalogCountry) {
    const product = await this.findProduct(id);
    const image = product.images[index];
    if (!image) throw new NotFoundException('Image not found.');
    await this.products.update(id, {
      images: product.images.filter((_, i) => i !== index),
    });
    await this.removeFile(`products/${image.fileName}`, image);
    return this.productDetails(id, country);
  }

  /** Moves an image to the front, making it the primary one. */
  async setPrimaryImage(id: string, index: number, country: CatalogCountry) {
    const product = await this.findProduct(id);
    const image = product.images[index];
    if (!image) throw new NotFoundException('Image not found.');
    await this.products.update(id, {
      images: [image, ...product.images.filter((_, i) => i !== index)],
    });
    return this.productDetails(id, country);
  }

  async setSafetyDataSheet(id: string, file: Upload, country: CatalogCountry) {
    const product = await this.findProduct(id);
    if (product.category !== 'chemicals') {
      throw new BadRequestException('Only chemicals have a safety data sheet.');
    }
    const old = product.safetyDataSheet;
    const sheet = await storeCatalogFile(file, this.storage, 'products', {
      noun: 'safety data sheet',
    });
    await this.products.update(id, { safetyDataSheet: sheet });
    if (old) await this.removeFile(`products/${old.fileName}`, old);
    return this.productDetails(id, country);
  }

  async removeSafetyDataSheet(id: string, country: CatalogCountry) {
    const product = await this.findProduct(id);
    const old = product.safetyDataSheet;
    if (old) {
      await this.products.update(id, { safetyDataSheet: null });
      await this.removeFile(`products/${old.fileName}`, old);
    }
    return this.productDetails(id, country);
  }

  async openSafetyDataSheet(id: string) {
    const { safetyDataSheet: doc } = await this.findProduct(id);
    if (!doc) throw new NotFoundException('No safety data sheet.');
    return {
      file: doc,
      stream: await this.open(`products/${doc.fileName}`, doc),
    };
  }

  /** Product images are public (the shop shows them); looked up by their stored name. */
  async openImage(fileName: string) {
    const product = await this.products
      .createQueryBuilder('p')
      .where(`p.images @> :match::jsonb`, {
        match: JSON.stringify([{ fileName }]),
      })
      .getOne();
    const image = product?.images.find((i) => i.fileName === fileName);
    if (!image) throw new NotFoundException('Image not found.');
    return {
      file: image,
      stream: await this.open(`products/${image.fileName}`, image),
    };
  }

  private open(key: string, file: StoredFile) {
    return this.storage.get(key, file.storage).catch(() => {
      throw new NotFoundException('The file is missing.');
    });
  }

  private removeFile(key: string, file: StoredFile) {
    return this.storage.delete(key, file.storage).catch(() => {});
  }
}
