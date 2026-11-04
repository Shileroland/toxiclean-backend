import { todayInWat } from '../bookings/bookings.service.js';

/** The "This Month" picker on the finance pages. */
export const PERIODS = [
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'all',
] as const;
export type Period = (typeof PERIODS)[number];

export const isPeriod = (v: string): v is Period =>
  (PERIODS as readonly string[]).includes(v);

const iso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** Inclusive YYYY-MM-DD bounds of a period (West Africa Time); null for all time. */
export function periodRange(period: Period, today = todayInWat()) {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  switch (period) {
    case 'this_month':
      return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case 'last_month':
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case 'this_quarter': {
      const q = Math.floor(m / 3) * 3;
      return { from: iso(y, q, 1), to: iso(y, q + 3, 0) };
    }
    case 'this_year':
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    default:
      return null;
  }
}

/** "PAY-2026-045": a prefix, the year and the record's number. */
export const financeRef = (prefix: string, date: string, n: number) =>
  `${prefix}-${date.slice(0, 4)}-${String(n).padStart(3, '0')}`;

export const escapeLike = (q: string) =>
  `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
