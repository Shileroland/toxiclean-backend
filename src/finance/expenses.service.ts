import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, LessThanOrEqual, Repository } from 'typeorm';
import { todayInWat } from '../bookings/bookings.service.js';
import { Supplier } from '../catalog/catalog.entity.js';
import {
  fileInfo,
  storeCatalogFile,
  type Upload,
} from '../catalog/file-storage.js';
import type { StockReceived } from '../catalog/inventory-events.js';
import { BRANCHES } from '../fumigators/fumigator.entity.js';
import { StorageService } from '../storage/storage.service.js';
import type { User } from '../users/user.entity.js';
import { AccountsService, checkBranch, PAGE_SIZE } from './accounts.service.js';
import type {
  ExpenseDto,
  ExpensePaymentDto,
  UpdateRecurrenceDto,
} from './finance.dto.js';
import {
  Expense,
  type ExpenseCategory,
  ExpensePayment,
  type FinanceCountry,
  type Frequency,
  RecurringExpense,
} from './finance.entity.js';
import { escapeLike, financeRef, type Period, periodRange } from './periods.js';

export const EXPENSE_STATUSES = ['paid', 'partial', 'unpaid'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** The date one period after `date` (month ends clamp, e.g. 31 Jan → 28 Feb). */
export function nextOccurrence(date: string, frequency: Frequency) {
  const d = new Date(`${date}T00:00:00Z`);
  if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[frequency];
  const day = d.getUTCDate();
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

export const expenseStatus = (amount: number, paid: number): ExpenseStatus =>
  paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

/** SQL for an expense's paid total (alias `e`). */
const PAID = `(SELECT COALESCE(SUM(p.amount), 0) FROM expense_payments p WHERE p."expenseId" = e.id)`;

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(ExpensePayment)
    private readonly payments: Repository<ExpensePayment>,
    @InjectRepository(RecurringExpense)
    private readonly schedules: Repository<RecurringExpense>,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    private readonly accounts: AccountsService,
    private readonly storage: StorageService,
  ) {}

  private async save(expense: Partial<Expense>) {
    const saved = await this.expenses.save(this.expenses.create(expense));
    saved.reference = financeRef('EXP', saved.date, saved.number);
    await this.expenses.update(saved.id, { reference: saved.reference });
    return saved;
  }

  /**
   * Creates the expenses recurring schedules are due for, up to today. Runs before
   * the lists are read, so nothing depends on a background job.
   */
  async materialise(today = todayInWat()) {
    const due = await this.schedules.find({
      where: { active: true, nextDate: LessThanOrEqual(today) },
    });
    for (const schedule of due) {
      const template = await this.expenses.findOne({
        where: { recurring: { id: schedule.id } },
        relations: { supplier: true },
        order: { date: 'ASC' },
      });
      let next = schedule.nextDate;
      while (next <= today && (!schedule.endDate || next <= schedule.endDate)) {
        if (template) {
          await this.save({
            country: template.country,
            branch: template.branch,
            description: template.description,
            category: template.category,
            amount: schedule.amount,
            date: next,
            supplier: template.supplier,
            origin: 'recurring',
            recurring: schedule,
          });
        }
        next = nextOccurrence(next, schedule.frequency);
      }
      const ended = Boolean(schedule.endDate && next > schedule.endDate);
      await this.schedules.update(schedule.id, {
        nextDate: next,
        active: !ended && Boolean(template),
      });
    }
  }

  private filtered({
    country,
    period,
    branch,
    q,
    categories,
    statuses,
  }: {
    country: FinanceCountry;
    period: Period;
    branch?: string;
    q?: string;
    categories?: ExpenseCategory[];
    statuses?: ExpenseStatus[];
  }) {
    const range = periodRange(period);
    const query = this.expenses
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.supplier', 's')
      .where('e.country = :country', { country });
    if (range) query.andWhere('e.date BETWEEN :from AND :to', range);
    if (branch) query.andWhere('e.branch = :branch', { branch });
    if (q) {
      query.andWhere(
        new Brackets((w) =>
          w
            .where('e.reference ILIKE :like')
            .orWhere('e.description ILIKE :like')
            .orWhere('s.name ILIKE :like'),
        ),
        { like: escapeLike(q) },
      );
    }
    if (categories?.length) {
      query.andWhere('e.category IN (:...categories)', { categories });
    }
    if (statuses?.length) {
      const conditions: Record<ExpenseStatus, string> = {
        paid: `${PAID} >= e.amount`,
        partial: `${PAID} > 0 AND ${PAID} < e.amount`,
        unpaid: `${PAID} = 0`,
      };
      query.andWhere(
        new Brackets((w) => {
          for (const s of statuses) w.orWhere(conditions[s]);
        }),
      );
    }
    return query;
  }

  private async paidFor(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.payments
      .createQueryBuilder('p')
      .select('p."expenseId"', 'id')
      .addSelect('SUM(p.amount)', 'sum')
      .where('p."expenseId" IN (:...ids)', { ids })
      .groupBy('p."expenseId"')
      .getRawMany<{ id: string; sum: string }>();
    return new Map(rows.map((r) => [r.id, Number(r.sum)]));
  }

  /** The Expenses page: totals for the period and the list. */
  async page(
    filters: Parameters<ExpensesService['filtered']>[0] & { page: number },
  ) {
    await this.materialise();
    const [[rows, total], sums] = await Promise.all([
      this.filtered(filters)
        .orderBy('e.date', 'DESC')
        .addOrderBy('e.number', 'DESC')
        .skip((filters.page - 1) * PAGE_SIZE)
        .take(PAGE_SIZE)
        .getManyAndCount(),
      this.filtered({ country: filters.country, period: filters.period })
        .select('COALESCE(SUM(e.amount), 0)', 'recorded')
        .addSelect(`COALESCE(SUM(LEAST(${PAID}, e.amount)), 0)`, 'paid')
        .getRawOne<{ recorded: string; paid: string }>(),
    ]);
    const paid = await this.paidFor(rows.map((e) => e.id));
    const recorded = Number(sums?.recorded ?? 0);
    const totalPaid = Number(sums?.paid ?? 0);
    return {
      summary: { recorded, paid: totalPaid, outstanding: recorded - totalPaid },
      items: rows.map((e) => ({
        id: e.id,
        reference: e.reference,
        date: e.date,
        description: e.description,
        category: e.category,
        supplier: e.supplier?.name ?? null,
        amount: e.amount,
        paid: paid.get(e.id) ?? 0,
        status: expenseStatus(e.amount, paid.get(e.id) ?? 0),
        branch: e.branch,
      })),
      total,
      page: filters.page,
      pageSize: PAGE_SIZE,
    };
  }

  async details(id: string) {
    const e = await this.expenses.findOne({
      where: { id },
      relations: {
        supplier: true,
        recurring: true,
        stockMovement: { product: true },
        payments: { account: true },
        recordedBy: true,
      },
      order: { payments: { date: 'ASC', createdAt: 'ASC' } },
    });
    if (!e) throw new NotFoundException('Expense not found.');
    const paid = e.payments.reduce((n, p) => n + p.amount, 0);
    const r = e.recurring;
    return {
      id: e.id,
      reference: e.reference,
      description: e.description,
      category: e.category,
      amount: e.amount,
      date: e.date,
      country: e.country,
      branch: e.branch,
      origin: e.origin,
      supplier: e.supplier && { id: e.supplier.id, name: e.supplier.name },
      document: fileInfo(e.document),
      paid,
      balance: Math.max(0, e.amount - paid),
      status: expenseStatus(e.amount, paid),
      payments: e.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        date: p.date,
        method: p.method,
        account: p.account && { id: p.account.id, name: p.account.name },
        reference: p.reference,
      })),
      recurrence: r && {
        id: r.id,
        frequency: r.frequency,
        amount: r.amount,
        startDate: r.startDate,
        endDate: r.endDate,
        nextDate: r.active ? r.nextDate : null,
        active: r.active,
      },
      stockMovement: e.stockMovement && {
        id: e.stockMovement.id,
        reference: e.stockMovement.reference,
        quantity: e.stockMovement.quantity,
        product: {
          id: e.stockMovement.product.id,
          name: e.stockMovement.product.name,
          sku: e.stockMovement.product.sku,
        },
      },
      recordedBy: e.recordedBy?.fullName ?? 'System',
      createdAt: e.createdAt,
    };
  }

  private async supplierFor(
    id: string | null | undefined,
    country: FinanceCountry,
  ) {
    if (!id) return null;
    const supplier = await this.suppliers.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException('Vendor not found.');
    if (supplier.country !== country) {
      throw new BadRequestException('Choose a vendor in the same country.');
    }
    return supplier;
  }

  /** Record Expense: with an optional first payment and recurring schedule. */
  async create(dto: ExpenseDto, user: User) {
    checkBranch(dto.country, dto.branch);
    const today = todayInWat();
    if (dto.date > today) {
      throw new BadRequestException('The expense date can’t be in the future.');
    }
    if (dto.payment && dto.payment.amount > dto.amount) {
      throw new BadRequestException(
        'The amount paid is more than the expense.',
      );
    }
    if (dto.recurrence?.endDate && dto.recurrence.endDate <= dto.date) {
      throw new BadRequestException(
        'The end date must be after the expense date.',
      );
    }
    const supplier = await this.supplierFor(dto.supplierId, dto.country);
    const recurring = dto.recurrence
      ? await this.schedules.save(
          this.schedules.create({
            frequency: dto.recurrence.frequency,
            amount: dto.amount,
            startDate: dto.date,
            endDate: dto.recurrence.endDate || null,
            nextDate: nextOccurrence(dto.date, dto.recurrence.frequency),
          }),
        )
      : null;
    const expense = await this.save({
      country: dto.country,
      branch: dto.branch,
      description: dto.description,
      category: dto.category,
      amount: dto.amount,
      date: dto.date,
      supplier,
      origin: 'manual',
      recurring,
      recordedBy: user,
    });
    if (dto.payment) await this.pay(expense, dto.payment, user);
    // A schedule started in the past catches up now.
    if (recurring) await this.materialise();
    return this.details(expense.id);
  }

  private async pay(expense: Expense, dto: ExpensePaymentDto, user: User) {
    if (dto.date > todayInWat()) {
      throw new BadRequestException('The payment date can’t be in the future.');
    }
    const account = await this.accounts.usable(dto.accountId, expense.country);
    await this.payments.manager.transaction(async (m) => {
      const payment = await m.getRepository(ExpensePayment).save(
        m.getRepository(ExpensePayment).create({
          expense,
          amount: dto.amount,
          date: dto.date,
          method: dto.method,
          account,
          reference: dto.reference || null,
          recordedBy: user,
        }),
      );
      await this.accounts.record(m, {
        account,
        kind: 'expense_payment',
        amount: -dto.amount,
        date: dto.date,
        reference: expense.reference ?? '',
        description: [expense.description, expense.supplier?.name]
          .filter(Boolean)
          .join(' • ')
          .slice(0, 300),
        expensePayment: payment,
        recordedBy: user,
      });
    });
  }

  async recordPayment(id: string, dto: ExpensePaymentDto, user: User) {
    const expense = await this.expenses.findOne({
      where: { id },
      relations: { supplier: true, payments: true },
    });
    if (!expense) throw new NotFoundException('Expense not found.');
    const paid = expense.payments.reduce((n, p) => n + p.amount, 0);
    if (paid >= expense.amount) {
      throw new ConflictException('This expense is already paid in full.');
    }
    if (dto.amount > expense.amount - paid) {
      throw new BadRequestException('The amount is more than the balance due.');
    }
    await this.pay(expense, dto, user);
    return this.details(id);
  }

  private async schedule(expenseId: string) {
    const expense = await this.expenses.findOne({
      where: { id: expenseId },
      relations: { recurring: true },
    });
    if (!expense) throw new NotFoundException('Expense not found.');
    if (!expense.recurring) {
      throw new BadRequestException('This expense doesn’t repeat.');
    }
    return { expense, schedule: expense.recurring };
  }

  /** Manage Recurrence: changes apply to future expenses only. */
  async updateRecurrence(expenseId: string, dto: UpdateRecurrenceDto) {
    const { schedule } = await this.schedule(expenseId);
    if (!schedule.active)
      throw new ConflictException('This schedule has stopped.');
    if (dto.endDate && dto.endDate < todayInWat()) {
      throw new BadRequestException('The end date can’t be in the past.');
    }
    const frequencyChanged = dto.frequency !== schedule.frequency;
    await this.schedules.update(schedule.id, {
      amount: dto.amount,
      frequency: dto.frequency,
      endDate: dto.endDate || null,
      // A new frequency counts on from the last expense created.
      ...(frequencyChanged && {
        nextDate: await this.nextFromLatest(schedule, dto.frequency),
      }),
    });
    return this.details(expenseId);
  }

  private async nextFromLatest(
    schedule: RecurringExpense,
    frequency: Frequency,
  ) {
    const latest = await this.expenses.findOne({
      where: { recurring: { id: schedule.id } },
      order: { date: 'DESC' },
    });
    return nextOccurrence(latest?.date ?? schedule.startDate, frequency);
  }

  /** Stop Recurring Expense: nothing new is created; past records stay. */
  async stopRecurrence(expenseId: string) {
    const { schedule } = await this.schedule(expenseId);
    await this.schedules.update(schedule.id, { active: false });
    return this.details(expenseId);
  }

  async setDocument(id: string, file: Upload) {
    const expense = await this.expenses.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found.');
    const old = expense.document;
    const document = await storeCatalogFile(file, this.storage, 'expenses', {
      noun: 'document',
    });
    await this.expenses.update(id, { document });
    if (old)
      await this.storage
        .delete(`expenses/${old.fileName}`, old.storage)
        .catch(() => {});
    return this.details(id);
  }

  async openDocument(id: string) {
    const expense = await this.expenses.findOne({ where: { id } });
    const doc = expense?.document;
    if (!doc) throw new NotFoundException('No document uploaded.');
    const stream = await this.storage
      .get(`expenses/${doc.fileName}`, doc.storage)
      .catch(() => {
        throw new NotFoundException('The file is missing.');
      });
    return { file: doc, stream };
  }

  /** A stock delivery's cost, as an unpaid Inventory Purchase expense. */
  async fromStockReceipt({
    movement,
    product,
    supplier,
    totalCost,
    user,
  }: StockReceived) {
    if (totalCost <= 0) return;
    const country = movement.country;
    await this.save({
      country,
      branch: (BRANCHES[country] as readonly string[]).includes(
        movement.location,
      )
        ? movement.location
        : BRANCHES[country][0],
      description:
        `Inventory Purchase — ${product.name} × ${movement.quantity}`.slice(
          0,
          200,
        ),
      category: 'inventory_purchase',
      amount: totalCost,
      date: movement.date,
      supplier,
      origin: 'inventory',
      stockMovement: movement,
      recordedBy: user,
    });
  }
}
