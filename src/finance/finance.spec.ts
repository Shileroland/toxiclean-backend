import { expenseStatus, nextOccurrence } from './expenses.service.js';
import {
  defaultInvoiceNotes,
  invoiceReference,
  invoiceStatus,
  invoiceTotals,
} from './invoices.service.js';
import { financeRef, periodRange } from './periods.js';

describe('nextOccurrence', () => {
  it('steps by week, month, quarter and year, clamping month ends', () => {
    expect(nextOccurrence('2026-10-29', 'weekly')).toBe('2026-11-05');
    expect(nextOccurrence('2026-10-29', 'monthly')).toBe('2026-11-29');
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextOccurrence('2026-11-30', 'quarterly')).toBe('2027-02-28');
    expect(nextOccurrence('2028-02-29', 'yearly')).toBe('2029-02-28');
  });
});

describe('periodRange', () => {
  it('gives inclusive bounds for each period', () => {
    const today = '2026-11-04';
    expect(periodRange('this_month', today)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(periodRange('last_month', today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(periodRange('this_quarter', today)).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
    expect(periodRange('this_year', today)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(periodRange('all', today)).toBeNull();
    expect(periodRange('last_month', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('formats references', () => {
    expect(financeRef('PAY', '2026-10-26', 45)).toBe('PAY-2026-045');
  });
});

describe('invoices', () => {
  it('adds tax to the line totals', () => {
    expect(invoiceTotals([{ quantity: 2, unitPrice: 140_000 }], 7.5)).toEqual({
      subtotal: 280_000,
      tax: 21_000,
      total: 301_000,
    });
  });

  it('is paid, overdue past its due date, partial or unpaid', () => {
    const today = '2026-11-04';
    expect(invoiceStatus(100, 100, '2026-10-01', today)).toBe('paid');
    expect(invoiceStatus(100, 40, '2026-11-03', today)).toBe('overdue');
    expect(invoiceStatus(100, 40, '2026-11-04', today)).toBe('partial');
    expect(invoiceStatus(100, 0, '2026-11-30', today)).toBe('unpaid');
  });

  it('expenses are paid, partial or unpaid', () => {
    expect(expenseStatus(120, 120)).toBe('paid');
    expect(expenseStatus(120, 50)).toBe('partial');
    expect(expenseStatus(120, 0)).toBe('unpaid');
  });
});

describe('invoice numbers and notes', () => {
  it('numbers invoices TCL-INV-<year>-<4 digits>', () => {
    expect(invoiceReference('2026', 1)).toBe('TCL-INV-2026-0001');
    expect(invoiceReference('2027', 1103)).toBe('TCL-INV-2027-1103');
  });

  it('starts with payment notes, plus delivery when it is invoiced separately', () => {
    expect(defaultInvoiceNotes('en', '2026-11-17', false)).toBe(
      'Payment: Please pay the balance by November 17, 2026, using the invoice number as your payment reference.',
    );
    const fr = defaultInvoiceNotes('fr', '2026-11-17', true).split('\n');
    expect(fr[0]).toContain('17 novembre 2026');
    expect(fr[1]).toMatch(/^Livraison : /);
  });
});
