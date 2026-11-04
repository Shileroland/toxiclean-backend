import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { StockMovement, Supplier } from '../catalog/catalog.entity.js';
import { PAGE_SIZE } from './accounts.service.js';
import { expenseStatus } from './expenses.service.js';
import type { VendorDto } from './finance.dto.js';
import { Expense, type FinanceCountry } from './finance.entity.js';

const isUniqueViolation = (err: unknown) =>
  err instanceof QueryFailedError &&
  (err.driverError as { code?: string }).code === '23505';

/** Vendors & Suppliers: who Toxiclean buys from, and what it owes them. */
@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,
  ) {}

  /** Billed (expenses) and paid totals per supplier. */
  private async totals(ids: string[]) {
    if (!ids.length) return new Map<string, { billed: number; paid: number }>();
    const rows = await this.expenses
      .createQueryBuilder('e')
      .select('e."supplierId"', 'id')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'billed')
      .addSelect(
        'COALESCE(SUM(LEAST(e.amount, (SELECT COALESCE(SUM(p.amount), 0) FROM expense_payments p WHERE p."expenseId" = e.id))), 0)',
        'paid',
      )
      .where('e."supplierId" IN (:...ids)', { ids })
      .groupBy('e."supplierId"')
      .getRawMany<{ id: string; billed: string; paid: string }>();
    return new Map(
      rows.map((r) => [
        r.id,
        { billed: Number(r.billed), paid: Number(r.paid) },
      ]),
    );
  }

  async page({
    country,
    q,
    statuses,
    page,
  }: {
    country: FinanceCountry;
    q?: string;
    statuses?: ('active' | 'inactive')[];
    page: number;
  }) {
    const all = await this.suppliers.find({
      where: { country },
      order: { active: 'DESC', name: 'ASC' },
    });
    const like = q?.toLowerCase();
    const shown = all.filter(
      (s) =>
        (!like ||
          s.name.toLowerCase().includes(like) ||
          (s.contactPerson ?? '').toLowerCase().includes(like)) &&
        (!statuses?.length ||
          statuses.includes(s.active ? 'active' : 'inactive')),
    );
    const slice = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totals = await this.totals(slice.map((s) => s.id));
    return {
      items: slice.map((s) => {
        const t = totals.get(s.id) ?? { billed: 0, paid: 0 };
        return {
          id: s.id,
          name: s.name,
          contactPerson: s.contactPerson,
          phone: s.phone,
          email: s.email,
          totalPurchases: t.billed,
          outstanding: t.billed - t.paid,
          active: s.active,
        };
      }),
      total: shown.length,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** For the Record Expense picker. */
  options(country: FinanceCountry) {
    return this.suppliers.find({
      select: { id: true, name: true },
      where: { country, active: true },
      order: { name: 'ASC' },
    });
  }

  async details(id: string) {
    const s = await this.suppliers.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Vendor not found.');
    const [totals, recent, deliveries] = await Promise.all([
      this.totals([id]),
      this.expenses.find({
        where: { supplier: { id } },
        relations: { payments: true },
        order: { date: 'DESC' },
        take: 5,
      }),
      this.movements.find({
        where: { supplier: { id }, type: 'received' },
        relations: { product: true },
        order: { date: 'DESC' },
        take: 5,
      }),
    ]);
    const t = totals.get(id) ?? { billed: 0, paid: 0 };
    return {
      id: s.id,
      name: s.name,
      country: s.country,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      active: s.active,
      totalPurchases: t.billed,
      totalSpend: t.paid,
      outstanding: t.billed - t.paid,
      recentExpenses: recent.map((e) => {
        const paid = e.payments.reduce((n, p) => n + p.amount, 0);
        return {
          id: e.id,
          reference: e.reference,
          date: e.date,
          description: e.description,
          amount: e.amount,
          paid,
          status: expenseStatus(e.amount, paid),
        };
      }),
      deliveries: deliveries.map((m) => ({
        id: m.id,
        reference: m.reference,
        date: m.date,
        quantity: m.quantity,
        location: m.location,
        product: { id: m.product.id, name: m.product.name, sku: m.product.sku },
      })),
      createdAt: s.createdAt,
    };
  }

  private async save(supplier: Supplier) {
    try {
      return await this.suppliers.save(supplier);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A vendor with this name already exists.');
      }
      throw err;
    }
  }

  private fields(dto: VendorDto) {
    return {
      name: dto.name,
      country: dto.country,
      contactPerson: dto.contactPerson || null,
      phone: dto.phone || null,
      email: dto.email || null,
      address: dto.address || null,
    };
  }

  async create(dto: VendorDto) {
    const saved = await this.save(this.suppliers.create(this.fields(dto)));
    return this.details(saved.id);
  }

  async update(id: string, dto: VendorDto) {
    const supplier = await this.suppliers.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException('Vendor not found.');
    Object.assign(supplier, this.fields(dto));
    if (dto.active !== undefined) supplier.active = dto.active;
    await this.save(supplier);
    return this.details(id);
  }
}
