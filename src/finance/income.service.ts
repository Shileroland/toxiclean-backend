import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { todayInWat } from '../bookings/bookings.service.js';
import type { Proforma } from '../proformas/proforma.entity.js';
import type { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import type { User } from '../users/user.entity.js';
import { AccountsService, checkBranch, PAGE_SIZE } from './accounts.service.js';
import type { IncomeDto } from './finance.dto.js';
import {
  type FinanceAccount,
  type FinanceCountry,
  Income,
  type IncomeSource,
  type Invoice,
  type PaymentMethod,
} from './finance.entity.js';
import { escapeLike, financeRef, type Period, periodRange } from './periods.js';

/** A payment recorded elsewhere (purchase request, proforma, invoice) that is income. */
export type IncomeFromPayment = {
  country: FinanceCountry;
  branch?: string | null;
  source: IncomeSource;
  receivedFrom: string;
  description: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  /** One of our accounts, or the account name as written on the payment. */
  account?: FinanceAccount | null;
  accountName?: string | null;
  paymentReference?: string | null;
  quoteRequest?: QuoteRequest | null;
  proforma?: Proforma | null;
  invoice?: Invoice | null;
  /** e.g. "pr-payment:<id>"; the same source is only recorded once. */
  sourcePayment?: string | null;
  recordedBy?: User | null;
};

const toRow = (i: Income) => ({
  id: i.id,
  reference: i.reference,
  date: i.date,
  receivedFrom: i.receivedFrom,
  description: i.description,
  source: i.source,
  method: i.method,
  amount: i.amount,
  branch: i.branch,
});

@Injectable()
export class IncomeService {
  constructor(
    @InjectRepository(Income) private readonly incomes: Repository<Income>,
    private readonly accounts: AccountsService,
  ) {}

  private filtered({
    country,
    period,
    branch,
    q,
    sources,
    methods,
  }: {
    country: FinanceCountry;
    period: Period;
    branch?: string;
    q?: string;
    sources?: IncomeSource[];
    methods?: PaymentMethod[];
  }) {
    const range = periodRange(period);
    const query = this.incomes
      .createQueryBuilder('i')
      .where('i.country = :country', { country });
    if (range) query.andWhere('i.date BETWEEN :from AND :to', range);
    if (branch) query.andWhere('i.branch = :branch', { branch });
    if (q) {
      query.andWhere(
        new Brackets((w) =>
          w
            .where('i.reference ILIKE :like')
            .orWhere('i.receivedFrom ILIKE :like')
            .orWhere('i.description ILIKE :like')
            .orWhere('i.paymentReference ILIKE :like'),
        ),
        { like: escapeLike(q) },
      );
    }
    if (sources?.length)
      query.andWhere('i.source IN (:...sources)', { sources });
    if (methods?.length)
      query.andWhere('i.method IN (:...methods)', { methods });
    return query;
  }

  /** The Income page: totals for the period (before search/filters) and the list. */
  async page(
    filters: Parameters<IncomeService['filtered']>[0] & { page: number },
  ) {
    const [[rows, total], sums] = await Promise.all([
      this.filtered(filters)
        .orderBy('i.date', 'DESC')
        .addOrderBy('i.number', 'DESC')
        .skip((filters.page - 1) * PAGE_SIZE)
        .take(PAGE_SIZE)
        .getManyAndCount(),
      this.filtered({ country: filters.country, period: filters.period })
        .select('i.source', 'source')
        .addSelect('COALESCE(SUM(i.amount), 0)', 'sum')
        .groupBy('i.source')
        .getRawMany<{ source: IncomeSource; sum: string }>(),
    ]);
    const of = (s: IncomeSource) =>
      Number(sums.find((x) => x.source === s)?.sum ?? 0);
    return {
      summary: {
        total: sums.reduce((n, s) => n + Number(s.sum), 0),
        services: of('services'),
        productSales: of('product_sales'),
        other: of('other'),
      },
      items: rows.map(toRow),
      total,
      page: filters.page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Income received this month, for the dashboard. */
  async revenueThisMonth(country: FinanceCountry) {
    const row = await this.filtered({ country, period: 'this_month' })
      .select('COALESCE(SUM(i.amount), 0)', 'sum')
      .getRawOne<{ sum: string }>();
    return Number(row?.sum ?? 0);
  }

  async details(id: string) {
    const i = await this.incomes.findOne({
      where: { id },
      relations: {
        account: true,
        invoice: true,
        quoteRequest: true,
        proforma: { lead: true },
        recordedBy: true,
      },
    });
    if (!i) throw new NotFoundException('Income record not found.');
    return {
      ...toRow(i),
      account: i.account ? { id: i.account.id, name: i.account.name } : null,
      accountName: i.account?.name ?? i.accountName,
      paymentReference: i.paymentReference,
      invoice: i.invoice && {
        id: i.invoice.id,
        reference: i.invoice.reference,
      },
      quoteRequest: i.quoteRequest && {
        id: i.quoteRequest.id,
        reference: i.quoteRequest.reference,
      },
      proforma: i.proforma && {
        id: i.proforma.id,
        reference: i.proforma.reference,
        lead: i.proforma.lead && {
          id: i.proforma.lead.id,
          reference: i.proforma.lead.reference,
        },
      },
      recordedBy: i.recordedBy?.fullName ?? 'System',
      createdAt: i.createdAt,
    };
  }

  /** Saves the income (PAY-…) and, with one of our accounts, its money-in entry. */
  async record(input: IncomeFromPayment) {
    if (input.sourcePayment) {
      const existing = await this.incomes.findOne({
        where: { sourcePayment: input.sourcePayment },
      });
      if (existing) return existing;
    }
    let account = input.account ?? null;
    if (!account && input.accountName) {
      [account] = await this.accounts.byName(input.country, [
        input.accountName,
      ]);
    }
    return this.incomes.manager.transaction(async (m) => {
      const repo = m.getRepository(Income);
      const income = await repo.save(
        repo.create({
          country: input.country,
          branch: input.branch ?? account?.branch ?? null,
          source: input.source,
          receivedFrom: input.receivedFrom.slice(0, 200),
          description: input.description.slice(0, 300),
          amount: input.amount,
          date: input.date,
          method: input.method,
          account,
          accountName: account ? null : (input.accountName ?? null),
          paymentReference: input.paymentReference || null,
          quoteRequest: input.quoteRequest ?? null,
          proforma: input.proforma ?? null,
          invoice: input.invoice ?? null,
          sourcePayment: input.sourcePayment ?? null,
          recordedBy: input.recordedBy ?? null,
        }),
      );
      income.reference = financeRef('PAY', income.date, income.number);
      await repo.update(income.id, { reference: income.reference });
      if (account) {
        await this.accounts.record(m, {
          account,
          kind: 'income',
          amount: income.amount,
          date: income.date,
          reference: income.reference,
          description: [income.description || 'Income', income.receivedFrom]
            .filter(Boolean)
            .join(' • ')
            .slice(0, 300),
          income,
          recordedBy: input.recordedBy ?? null,
        });
      }
      return income;
    });
  }

  /** Record Income. */
  async create(dto: IncomeDto, user: User) {
    checkBranch(dto.country, dto.branch);
    const account = await this.accounts.usable(dto.accountId, dto.country);
    if (dto.date > todayInWat()) {
      throw new BadRequestException('The payment date can’t be in the future.');
    }
    const income = await this.record({
      country: dto.country,
      branch: dto.branch,
      source: dto.source,
      receivedFrom: dto.receivedFrom,
      description: dto.description ?? '',
      amount: dto.amount,
      date: dto.date,
      method: dto.method,
      account,
      paymentReference: dto.paymentReference,
      recordedBy: user,
    });
    return this.details(income.id);
  }
}
