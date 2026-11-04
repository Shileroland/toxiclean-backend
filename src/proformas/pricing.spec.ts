import { priceProforma, type LineInput } from './pricing.js';

const line = (
  description: string,
  quantity: number,
  unitRate: number,
  section: LineInput['section'] = 'outdoor',
): LineInput => ({
  section,
  description,
  detail: null,
  quantity,
  unit: 'each',
  unitRate,
});

// The Greenfield Hotels proforma from the design.
const greenfield = [
  line('Kitchen', 12, 5_000, 'indoor'),
  line('Storage Room', 30, 5_000, 'indoor'),
  line('Land Treatment', 250, 800),
  line('Bush Clearing', 100, 500),
  line('Entry Point Sealing', 6, 6_000),
  line('Bait Stations', 12, 4_000),
  line('Inspection', 1, 20_000),
  line('Follow-up Visits', 3, 12_000),
];

describe('priceProforma', () => {
  it('matches the design: ₦600,000 + 7.5% tax = ₦645,000, 50% deposit', () => {
    const totals = priceProforma({
      lines: greenfield,
      discountPercent: 0,
      taxPercent: 7.5,
      depositPercent: 50,
      servicePlan: null,
    });
    expect(totals).toMatchObject({
      subtotal: 600_000,
      discountAmount: 0,
      taxAmount: 45_000,
      total: 645_000,
      depositAmount: 322_500,
      servicePlan: null,
    });
    expect(totals.lines[0].amount).toBe(60_000);
  });

  it('taxes the discounted amount', () => {
    const totals = priceProforma({
      lines: [line('Inspection', 1, 100_000)],
      discountPercent: 10,
      taxPercent: 7.5,
      depositPercent: 0,
      servicePlan: null,
    });
    expect(totals).toMatchObject({
      discountAmount: 10_000,
      taxAmount: 6_750,
      total: 96_750,
    });
  });

  it('rounds fractional quantities to whole units', () => {
    const totals = priceProforma({
      lines: [line('Kitchen', 12.35, 4_999, 'indoor')],
      discountPercent: 0,
      taxPercent: 0,
      depositPercent: 50,
      servicePlan: null,
    });
    expect(totals.lines[0].amount).toBe(61_738);
    expect(totals.depositAmount).toBe(30_869);
  });

  it('prices an upfront service plan with its discount, outside the total', () => {
    const totals = priceProforma({
      lines: greenfield,
      discountPercent: 0,
      taxPercent: 7.5,
      depositPercent: 50,
      servicePlan: {
        startDate: '2026-10-20',
        durationMonths: 5,
        maintenanceIntervalMonths: 2,
        billing: 'upfront',
        monthlyFee: 80_000,
        maintenanceVisitFee: 50_000,
        upfrontDiscountPercent: 5,
      },
    });
    expect(totals.servicePlan).toEqual({
      monthlySubtotal: 400_000,
      upfrontDiscount: 20_000,
      planTotal: 380_000,
    });
    expect(totals.total).toBe(645_000);
  });
});
