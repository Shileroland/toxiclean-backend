import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import { todayInWat } from '../bookings/bookings.service.js';
import { BRANCHES } from '../fumigators/fumigator.entity.js';
import type { QuoteRequest } from '../quote-requests/quote-request.entity.js';

/** The parts of a purchase request stock changes need. */
export type StockRequest = Pick<
  QuoteRequest,
  'id' | 'reference' | 'country' | 'items'
>;
import type { User } from '../users/user.entity.js';
import { InventoryEvents } from './inventory-events.js';
import type {
  AdjustStockDto,
  ReceiveStockDto,
  ReorderLevelDto,
  SupplierDto,
} from './catalog.dto.js';
import {
  type CatalogCountry,
  type MovementType,
  Product,
  StockLevel,
  StockMovement,
  Supplier,
} from './catalog.entity.js';

export const PAGE_SIZE = 10;

export const STOCK_STATUSES = [
  'in_stock',
  'low_stock',
  'out_of_stock',
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const branchesOf = (country: CatalogCountry): readonly string[] =>
  BRANCHES[country];

export function stockStatus(
  available: number,
  reorderLevel: number | null,
): StockStatus {
  if (available <= 0) return 'out_of_stock';
  if (reorderLevel !== null && available <= reorderLevel) return 'low_stock';
  return 'in_stock';
}

type LocationStock = {
  location: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number | null;
  status: StockStatus;
};

/** A product's stock across the given locations (missing rows count as empty). */
export function summarise(levels: StockLevel[], locations: readonly string[]) {
  const rows: LocationStock[] = locations.map((location) => {
    const l = levels.find((s) => s.location === location);
    const onHand = l?.onHand ?? 0;
    const reserved = l?.reserved ?? 0;
    const reorderLevel = l?.reorderLevel ?? null;
    return {
      location,
      onHand,
      reserved,
      available: onHand - reserved,
      reorderLevel,
      status: stockStatus(onHand - reserved, reorderLevel),
    };
  });
  const sum = (k: 'onHand' | 'reserved' | 'available') =>
    rows.reduce((n, r) => n + r[k], 0);
  // Worst status across locations, and how many locations have it.
  const worst: StockStatus = rows.every((r) => r.status === 'out_of_stock')
    ? 'out_of_stock'
    : rows.some((r) => r.status !== 'in_stock')
      ? 'low_stock'
      : 'in_stock';
  return {
    onHand: sum('onHand'),
    reserved: sum('reserved'),
    available: sum('available'),
    /** The single location's level, or null when showing several ("Per Location"). */
    reorderLevel: rows.length === 1 ? rows[0].reorderLevel : null,
    status: worst,
    /** Locations not in stock (low or out), out of `locations.length`. */
    affectedLocations: rows.filter((r) => r.status !== 'in_stock').length,
    locationCount: rows.length,
    locations: rows,
  };
}

const PREFIX: Partial<Record<MovementType, string>> = {
  received: 'GR',
  adjustment: 'ADJ',
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(StockLevel)
    private readonly levels: Repository<StockLevel>,
    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    private readonly events: InventoryEvents,
  ) {}

  private checkLocation(country: CatalogCountry, location: string) {
    if (!branchesOf(country).includes(location)) {
      throw new BadRequestException('Choose one of the country’s branches.');
    }
  }

  /** The level row for a product at a location, created empty if needed. */
  private async level(
    m: EntityManager,
    productId: string,
    country: CatalogCountry,
    location: string,
  ) {
    await m
      .createQueryBuilder()
      .insert()
      .into(StockLevel)
      .values({ product: { id: productId }, country, location })
      .orIgnore()
      .execute();
    // Locked so concurrent changes to the same row apply one after the other.
    return m
      .getRepository(StockLevel)
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s."productId" = :productId AND s.location = :location', {
        productId,
        location,
      })
      .getOneOrFail();
  }

  private async record(
    m: EntityManager,
    movement: Partial<StockMovement> & { type: MovementType },
  ) {
    const saved = await m.getRepository(StockMovement).save(
      m.getRepository(StockMovement).create({
        reference: movement.reference ?? '',
        date: todayInWat(),
        ...movement,
      }),
    );
    const prefix = PREFIX[movement.type];
    if (prefix && !movement.reference) {
      saved.reference = `${prefix}-${saved.date.slice(0, 4)}-${String(saved.number).padStart(3, '0')}`;
      await m
        .getRepository(StockMovement)
        .update(saved.id, { reference: saved.reference });
    }
    return saved;
  }

  async stockFor(productIds: string[], country: CatalogCountry) {
    if (!productIds.length) return [];
    return this.levels.find({
      where: { product: { id: In(productIds) }, country },
      relations: { product: true },
    });
  }

  /** The Inventory tab: every product with its stock in the country (or one location). */
  async page({
    country,
    location,
    q,
    statuses,
    page,
  }: {
    country: CatalogCountry;
    location?: string;
    q?: string;
    statuses?: StockStatus[];
    page: number;
  }) {
    if (location) this.checkLocation(country, location);
    const locations = location ? [location] : branchesOf(country);
    const query = this.products.createQueryBuilder('p').orderBy('p.name');
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query.where('(p.name ILIKE :like OR p.sku ILIKE :like)', { like });
    }
    const products = await query.getMany();
    const levels = await this.stockFor(
      products.map((p) => p.id),
      country,
    );
    const rows = products
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        ...summarise(
          levels.filter((l) => l.product.id === p.id),
          locations,
        ),
      }))
      .filter((r) => !statuses?.length || statuses.includes(r.status));
    return {
      items: rows
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        // The per-location breakdown is for the details panel only.
        .map((r) => ({ ...r, locations: undefined })),
      total: rows.length,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Products at or below their reorder level somewhere in the country (dashboard). */
  async lowStockCount(country: CatalogCountry) {
    const row = await this.levels
      .createQueryBuilder('s')
      .select('COUNT(DISTINCT s."productId")', 'count')
      .where('s.country = :country', { country })
      .andWhere('s."reorderLevel" IS NOT NULL')
      .andWhere('s."onHand" - s.reserved <= s."reorderLevel"')
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  async details(productId: string, country: CatalogCountry, location?: string) {
    if (location) this.checkLocation(country, location);
    const product = await this.products.findOne({
      where: { id: productId },
      relations: { brand: true },
    });
    if (!product) throw new NotFoundException('Product not found.');
    const locations = location ? [location] : branchesOf(country);
    const [levels, recent] = await Promise.all([
      this.levels.find({ where: { product: { id: productId }, country } }),
      this.movements.find({
        where: {
          product: { id: productId },
          country,
          ...(location && { location }),
        },
        order: { createdAt: 'DESC' },
        take: 3,
        relations: { recordedBy: true, supplier: true },
      }),
    ]);
    return {
      product,
      stock: summarise(levels, locations),
      recentMovements: recent.map(toMovement),
    };
  }

  async movementPage({
    productId,
    country,
    location,
    types,
    q,
    page,
  }: {
    productId: string;
    country: CatalogCountry;
    location?: string;
    types?: MovementType[];
    q?: string;
    page: number;
  }) {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    const query = this.movements
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.recordedBy', 'u')
      .leftJoinAndSelect('m.supplier', 's')
      .where('m."productId" = :productId AND m.country = :country', {
        productId,
        country,
      })
      .orderBy('m.date', 'DESC')
      .addOrderBy('m.createdAt', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (location) query.andWhere('m.location = :location', { location });
    if (types?.length) query.andWhere('m.type IN (:...types)', { types });
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query.andWhere('m.reference ILIKE :like', { like });
    }
    const [rows, total] = await query.getManyAndCount();
    return {
      product: { id: product.id, name: product.name, sku: product.sku },
      items: rows.map(toMovement),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Receive Stock: a supplier delivery into a location (GR-…). */
  async receive(dto: ReceiveStockDto, user: User) {
    this.checkLocation(dto.country, dto.location);
    const [product, supplier] = await Promise.all([
      this.products.findOne({ where: { id: dto.productId } }),
      this.suppliers.findOne({ where: { id: dto.supplierId } }),
    ]);
    if (!product) throw new NotFoundException('Product not found.');
    if (!supplier) throw new NotFoundException('Supplier not found.');
    if (dto.date > todayInWat()) {
      throw new BadRequestException(
        'The date received can’t be in the future.',
      );
    }
    const movement = await this.levels.manager.transaction(async (m) => {
      const level = await this.level(m, product.id, dto.country, dto.location);
      await m.getRepository(StockLevel).update(level.id, {
        onHand: level.onHand + dto.quantity,
        ...(dto.reorderLevel !== undefined && {
          reorderLevel: dto.reorderLevel,
        }),
      });
      const movement = await this.record(m, {
        type: 'received',
        product,
        country: dto.country,
        location: dto.location,
        quantity: dto.quantity,
        date: dto.date,
        supplier,
        supplierReference: dto.supplierReference || null,
        totalCost: dto.totalCost,
        recordedBy: user,
      });
      return movement;
    });
    // The delivery's cost becomes an unpaid Inventory Purchase expense.
    await this.events.emitReceived({
      movement,
      product,
      supplier,
      totalCost: dto.totalCost,
      user,
    });
    return { reference: movement.reference };
  }

  /** Adjust Stock: a counted correction with a reason (ADJ-…). */
  async adjust(productId: string, dto: AdjustStockDto, user: User) {
    this.checkLocation(dto.country, dto.location);
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    return this.levels.manager.transaction(async (m) => {
      const level = await this.level(m, product.id, dto.country, dto.location);
      const change = dto.direction === 'add' ? dto.quantity : -dto.quantity;
      if (level.onHand + change < 0) {
        throw new BadRequestException(
          `Only ${level.onHand} units are on hand at this location.`,
        );
      }
      await m
        .getRepository(StockLevel)
        .update(level.id, { onHand: level.onHand + change });
      const movement = await this.record(m, {
        type: 'adjustment',
        product,
        country: dto.country,
        location: dto.location,
        quantity: change,
        reason: dto.reason,
        recordedBy: user,
      });
      return { reference: movement.reference };
    });
  }

  async setReorderLevel(productId: string, dto: ReorderLevelDto) {
    this.checkLocation(dto.country, dto.location);
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    await this.levels.manager.transaction(async (m) => {
      const level = await this.level(m, product.id, dto.country, dto.location);
      await m
        .getRepository(StockLevel)
        .update(level.id, { reorderLevel: dto.reorderLevel });
    });
  }

  // ---- Suppliers ----

  listSuppliers(country: CatalogCountry) {
    return this.suppliers.find({
      where: { country, active: true },
      order: { name: 'ASC' },
    });
  }

  async createSupplier(dto: SupplierDto) {
    const existing = await this.suppliers
      .createQueryBuilder('s')
      .where('LOWER(s.name) = LOWER(:name)', { name: dto.name })
      .getOne();
    if (existing) {
      throw new ConflictException('A supplier with this name already exists.');
    }
    return this.suppliers.save(
      this.suppliers.create({ name: dto.name, country: dto.country }),
    );
  }

  // ---- Purchase requests ----
  // A confirmed request holds its items at the country's first branch; fulfilling it
  // takes them out of stock; declining or cancelling lets them go.

  /** Items matched to catalog products (unknown slugs are skipped). */
  private async lines(request: StockRequest) {
    const slugs = request.items.map((i) => i.productSlug);
    const products = slugs.length
      ? await this.products.find({ where: { slug: In(slugs) } })
      : [];
    return request.items.flatMap((item) => {
      const product = products.find((p) => p.slug === item.productSlug);
      return product ? [{ product, quantity: item.quantity }] : [];
    });
  }

  /** Movements already recorded for the request, by type. */
  private async history(m: EntityManager, requestId: number) {
    const rows = await m.getRepository(StockMovement).find({
      where: { quoteRequest: { id: requestId } },
      relations: { product: true },
    });
    return (type: MovementType) => rows.filter((r) => r.type === type);
  }

  async reserveFor(request: StockRequest) {
    const country = request.country as CatalogCountry;
    const location = branchesOf(country)[0];
    const lines = await this.lines(request);
    if (!location || !lines.length) return;
    await this.levels.manager.transaction(async (m) => {
      const done = await this.history(m, request.id);
      // Already held (and not let go since): nothing to do.
      if (done('reserved').length > done('released').length) return;
      for (const { product, quantity } of lines) {
        const level = await this.level(m, product.id, country, location);
        await m
          .getRepository(StockLevel)
          .update(level.id, { reserved: level.reserved + quantity });
        await this.record(m, {
          type: 'reserved',
          reference: request.reference ?? '',
          product,
          country,
          location,
          quantity,
          quoteRequest: { id: request.id } as QuoteRequest,
        });
      }
    });
  }

  /** Lets go of what the request held (declined or cancelled). */
  async releaseFor(request: StockRequest) {
    await this.levels.manager.transaction(async (m) => {
      const done = await this.history(m, request.id);
      if (done('issued').length) return;
      if (done('reserved').length <= done('released').length) return;
      const held = done('reserved').slice(done('released').length);
      for (const r of held) {
        const level = await this.level(m, r.product.id, r.country, r.location);
        await m.getRepository(StockLevel).update(level.id, {
          reserved: Math.max(0, level.reserved - r.quantity),
        });
        await this.record(m, {
          type: 'released',
          reference: r.reference,
          product: r.product,
          country: r.country,
          location: r.location,
          quantity: -r.quantity,
          quoteRequest: { id: request.id } as QuoteRequest,
        });
      }
    });
  }

  /** Takes the request's items out of stock (dispatched or ready for pickup). */
  async issueFor(request: StockRequest) {
    const country = request.country as CatalogCountry;
    const lines = await this.lines(request);
    await this.levels.manager.transaction(async (m) => {
      const done = await this.history(m, request.id);
      if (done('issued').length) return;
      const held = done('reserved').length > done('released').length;
      const heldRows = held
        ? done('reserved').slice(done('released').length)
        : [];
      const location = heldRows[0]?.location ?? branchesOf(country)[0];
      if (!location) return;
      for (const { product, quantity } of lines) {
        const hold = heldRows.find((r) => r.product.id === product.id);
        const level = await this.level(m, product.id, country, location);
        await m.getRepository(StockLevel).update(level.id, {
          onHand: level.onHand - quantity,
          reserved: Math.max(0, level.reserved - (hold?.quantity ?? 0)),
        });
        await this.record(m, {
          type: 'issued',
          reference: request.reference ?? '',
          product,
          country,
          location,
          quantity: -quantity,
          quoteRequest: { id: request.id } as QuoteRequest,
        });
      }
    });
  }
}

export function toMovement(m: StockMovement) {
  return {
    id: m.id,
    reference: m.reference,
    type: m.type,
    location: m.location,
    quantity: m.quantity,
    date: m.date,
    supplier: m.supplier && { id: m.supplier.id, name: m.supplier.name },
    supplierReference: m.supplierReference,
    totalCost: m.totalCost,
    reason: m.reason,
    recordedBy: m.recordedBy?.fullName ?? 'System',
    createdAt: m.createdAt,
  };
}
