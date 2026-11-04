import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import { todayInWat } from '../bookings/bookings.service.js';
import { BRANCHES } from '../fumigators/fumigator.entity.js';
import type { User } from '../users/user.entity.js';
import type {
  AccountDto,
  AdjustBalanceDto,
  TransferDto,
  UpdateAccountDto,
} from './finance.dto.js';
import {
  AccountEntry,
  type AccountType,
  type EntryKind,
  FinanceAccount,
  type FinanceCountry,
} from './finance.entity.js';
import { escapeLike, financeRef, type Period, periodRange } from './periods.js';

export const PAGE_SIZE = 10;

export function checkBranch(country: FinanceCountry, branch: string) {
  if (!(BRANCHES[country] as readonly string[]).includes(branch)) {
    throw new BadRequestException('Choose one of the country’s branches.');
  }
}

export const toEntry = (e: AccountEntry) => ({
  id: e.id,
  kind: e.kind,
  amount: e.amount,
  date: e.date,
  reference: e.reference,
  description: e.description,
  reason: e.reason,
  counterpart: e.counterpart && {
    id: e.counterpart.id,
    name: e.counterpart.name,
  },
  incomeId: e.income?.id ?? null,
  expenseId: e.expensePayment?.expense?.id ?? null,
  recordedBy: e.recordedBy?.fullName ?? 'System',
  createdAt: e.createdAt,
});

/** Bank and cash accounts, and the entries that make up their recorded balances. */
@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(FinanceAccount)
    private readonly accounts: Repository<FinanceAccount>,
    @InjectRepository(AccountEntry)
    private readonly entries: Repository<AccountEntry>,
  ) {}

  /** Opening balance plus every entry, per account. */
  async balances(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.entries
      .createQueryBuilder('e')
      .select('e."accountId"', 'id')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'sum')
      .where('e."accountId" IN (:...ids)', { ids })
      .groupBy('e."accountId"')
      .getRawMany<{ id: string; sum: string }>();
    return new Map(rows.map((r) => [r.id, Number(r.sum)]));
  }

  private row(a: FinanceAccount, moved: Map<string, number>) {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      country: a.country,
      branch: a.branch,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      accountHolder: a.accountHolder,
      openingBalance: a.openingBalance,
      openingDate: a.openingDate,
      balance: a.openingBalance + (moved.get(a.id) ?? 0),
      active: a.active,
    };
  }

  /** The Accounts page: the list, and balance totals for the country. */
  async page({
    country,
    branch,
    q,
    types,
    statuses,
    page,
  }: {
    country: FinanceCountry;
    branch?: string;
    q?: string;
    types?: AccountType[];
    statuses?: ('active' | 'inactive')[];
    page: number;
  }) {
    const all = await this.accounts.find({
      where: { country },
      order: { active: 'DESC', name: 'ASC' },
    });
    const moved = await this.balances(all.map((a) => a.id));
    const rows = all.map((a) => this.row(a, moved));
    const active = rows.filter((r) => r.active);
    const like = q?.toLowerCase();
    const shown = rows.filter(
      (r) =>
        (!branch || r.branch === branch) &&
        (!like || r.name.toLowerCase().includes(like)) &&
        (!types?.length || types.includes(r.type)) &&
        (!statuses?.length ||
          statuses.includes(r.active ? 'active' : 'inactive')),
    );
    const sum = (type: AccountType) =>
      active.filter((r) => r.type === type).reduce((n, r) => n + r.balance, 0);
    return {
      summary: {
        asOf: todayInWat(),
        bank: sum('bank'),
        cash: sum('cash'),
        accounts: active.length,
      },
      items: shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total: shown.length,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Active accounts, for "Receiving Account" / "Paid From" pickers. */
  async options(country: FinanceCountry) {
    const all = await this.accounts.find({
      where: { country, active: true },
      order: { name: 'ASC' },
    });
    const moved = await this.balances(all.map((a) => a.id));
    return all.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      branch: a.branch,
      balance: a.openingBalance + (moved.get(a.id) ?? 0),
    }));
  }

  async find(id: string) {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found.');
    return account;
  }

  /** An account that can take a new transaction in the given country. */
  async usable(id: string, country: FinanceCountry) {
    const account = await this.find(id);
    if (!account.active) {
      throw new BadRequestException(`${account.name} is no longer active.`);
    }
    if (account.country !== country) {
      throw new BadRequestException('Choose an account in the same country.');
    }
    return account;
  }

  private totals(id: string, period: Period) {
    const range = periodRange(period);
    const query = this.entries
      .createQueryBuilder('e')
      .select(
        'COALESCE(SUM(CASE WHEN e.amount > 0 THEN e.amount END), 0)',
        'in',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN e.amount < 0 THEN -e.amount END), 0)',
        'out',
      )
      .where('e."accountId" = :id', { id });
    if (range) query.andWhere('e.date BETWEEN :from AND :to', range);
    return query.getRawOne<{ in: string; out: string }>().then((r) => ({
      moneyIn: Number(r?.in ?? 0),
      moneyOut: Number(r?.out ?? 0),
    }));
  }

  private entryQuery() {
    return this.entries
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.counterpart', 'c')
      .leftJoinAndSelect('e.recordedBy', 'u')
      .leftJoinAndSelect('e.income', 'i')
      .leftJoinAndSelect('e.expensePayment', 'p')
      .leftJoinAndSelect('p.expense', 'x');
  }

  /** Account Details: balances, this period's money in and out, recent entries. */
  async details(id: string, period: Period) {
    const account = await this.find(id);
    const [moved, totals, recent] = await Promise.all([
      this.balances([id]),
      this.totals(id, period),
      this.entryQuery()
        .where('e."accountId" = :id', { id })
        .orderBy('e.date', 'DESC')
        .addOrderBy('e.createdAt', 'DESC')
        .take(3)
        .getMany(),
    ]);
    return {
      ...this.row(account, moved),
      period,
      ...totals,
      recentEntries: recent.map(toEntry),
    };
  }

  /** Transaction History: ?period&q&direction=in,out&page */
  async entryPage({
    id,
    period,
    q,
    directions,
    page,
  }: {
    id: string;
    period: Period;
    q?: string;
    directions?: ('in' | 'out')[];
    page: number;
  }) {
    const account = await this.find(id);
    const range = periodRange(period);
    const query = this.entryQuery()
      .where('e."accountId" = :id', { id })
      .orderBy('e.date', 'DESC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (range) query.andWhere('e.date BETWEEN :from AND :to', range);
    if (q) {
      query.andWhere('(e.reference ILIKE :like OR e.description ILIKE :like)', {
        like: escapeLike(q),
      });
    }
    if (directions?.length === 1) {
      query.andWhere(directions[0] === 'in' ? 'e.amount > 0' : 'e.amount < 0');
    }
    const [[rows, total], moved, totals] = await Promise.all([
      query.getManyAndCount(),
      this.balances([id]),
      this.totals(id, period),
    ]);
    return {
      account: this.row(account, moved),
      ...totals,
      items: rows.map(toEntry),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  async create(dto: AccountDto) {
    checkBranch(dto.country, dto.branch);
    const bank = dto.type === 'bank';
    const saved = await this.accounts.save(
      this.accounts.create({
        name: dto.name,
        type: dto.type,
        country: dto.country,
        branch: dto.branch,
        bankName: bank ? dto.bankName || null : null,
        accountNumber: bank ? dto.accountNumber || null : null,
        accountHolder: bank ? dto.accountHolder || null : null,
        openingBalance: dto.openingBalance,
        openingDate: dto.openingDate,
      }),
    );
    return this.details(saved.id, 'this_month');
  }

  async update(id: string, dto: UpdateAccountDto) {
    const account = await this.find(id);
    checkBranch(account.country, dto.branch);
    const bank = dto.type === 'bank';
    await this.accounts.update(id, {
      name: dto.name,
      type: dto.type,
      branch: dto.branch,
      bankName: bank ? dto.bankName || null : null,
      accountNumber: bank ? dto.accountNumber || null : null,
      accountHolder: bank ? dto.accountHolder || null : null,
      active: dto.active,
    });
    return this.details(id, 'this_month');
  }

  /** Adds an entry inside a transaction; the reference defaults to TRF-/BAL-<number>. */
  async record(
    m: EntityManager,
    entry: Partial<AccountEntry> & {
      account: FinanceAccount;
      kind: EntryKind;
      amount: number;
      date: string;
      description: string;
    },
    prefix?: string,
  ) {
    const repo = m.getRepository(AccountEntry);
    const saved = await repo.save(
      repo.create({ reference: entry.reference ?? '', ...entry }),
    );
    if (prefix) {
      saved.reference = financeRef(prefix, saved.date, saved.number);
      await repo.update(saved.id, { reference: saved.reference });
    }
    return saved;
  }

  /** Corrects the recorded balance (BAL-…); no money moves. */
  async adjust(id: string, dto: AdjustBalanceDto, user: User) {
    const account = await this.find(id);
    if (dto.date > todayInWat()) {
      throw new BadRequestException('The date can’t be in the future.');
    }
    await this.entries.manager.transaction((m) =>
      this.record(
        m,
        {
          account,
          kind: 'adjustment',
          amount: dto.direction === 'increase' ? dto.amount : -dto.amount,
          date: dto.date,
          description: 'Balance Adjustment',
          reason: dto.reason,
          recordedBy: user,
        },
        'BAL',
      ),
    );
    return this.details(id, 'this_month');
  }

  /** Records money moved between two of the country's accounts (TRF-…). */
  async transfer(dto: TransferDto, user: User) {
    if (dto.fromId === dto.toId) {
      throw new BadRequestException('Choose two different accounts.');
    }
    const [from, to] = await Promise.all([
      this.find(dto.fromId),
      this.find(dto.toId),
    ]);
    if (!from.active || !to.active) {
      throw new BadRequestException('Both accounts must be active.');
    }
    if (from.country !== to.country) {
      throw new BadRequestException('Transfers stay within one country.');
    }
    if (dto.date > todayInWat()) {
      throw new BadRequestException('The date can’t be in the future.');
    }
    const available =
      from.openingBalance +
      ((await this.balances([from.id])).get(from.id) ?? 0);
    if (dto.amount > available) {
      throw new BadRequestException(
        `${from.name} only has ${available.toLocaleString('en-NG')} recorded.`,
      );
    }
    return this.entries.manager.transaction(async (m) => {
      const out = await this.record(
        m,
        {
          account: from,
          kind: 'transfer',
          amount: -dto.amount,
          date: dto.date,
          description: `Transfer to ${to.name}`,
          counterpart: to,
          recordedBy: user,
        },
        'TRF',
      );
      await this.record(m, {
        account: to,
        kind: 'transfer',
        amount: dto.amount,
        date: dto.date,
        reference: out.reference,
        description: `Transfer from ${from.name}`,
        counterpart: from,
        recordedBy: user,
      });
      return { reference: out.reference };
    });
  }

  /** Accounts matched by name (for payments recorded against an account name). */
  async byName(country: FinanceCountry, names: string[]) {
    if (!names.length) return [];
    return this.accounts.find({ where: { country, name: In(names) } });
  }
}
