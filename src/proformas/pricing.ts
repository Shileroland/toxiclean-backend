/** Proforma maths. Amounts are whole naira / francs; every rounding happens here. */

export type LineInput = {
  /** `products`: items on a bulk quotation. */
  section: 'indoor' | 'outdoor' | 'products';
  description: string;
  /** e.g. "Furnished" under an indoor area. */
  detail: string | null;
  quantity: number;
  unit: 'm2' | 'each';
  unitRate: number;
};

export type PricedLine = LineInput & { amount: number };

export type ServicePlanInput = {
  /** YYYY-MM-DD */
  startDate: string;
  durationMonths: number;
  maintenanceIntervalMonths: number;
  billing: 'monthly' | 'upfront';
  monthlyFee: number;
  maintenanceVisitFee: number;
  upfrontDiscountPercent: number;
};

export type PricingInput = {
  lines: LineInput[];
  discountPercent: number;
  taxPercent: number;
  depositPercent: number;
  servicePlan: ServicePlanInput | null;
};

export type ServicePlanTotals = {
  monthlySubtotal: number;
  /** Only when billed upfront. */
  upfrontDiscount: number;
  /** What the customer pays for the monthly period: upfront, or month by month. */
  planTotal: number;
};

export type PricingTotals = {
  lines: PricedLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  depositAmount: number;
  servicePlan: ServicePlanTotals | null;
};

const percentOf = (amount: number, percent: number) =>
  Math.round((amount * percent) / 100);

/**
 * subtotal → discount → tax on the discounted amount → total → deposit. The service
 * plan is priced separately and excludes tax (as the proforma states).
 */
export function priceProforma(input: PricingInput): PricingTotals {
  const lines = input.lines.map((line) => ({
    ...line,
    amount: Math.round(line.quantity * line.unitRate),
  }));
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const discountAmount = percentOf(subtotal, input.discountPercent);
  const taxAmount = percentOf(subtotal - discountAmount, input.taxPercent);
  const total = subtotal - discountAmount + taxAmount;
  const plan = input.servicePlan;
  let servicePlan: ServicePlanTotals | null = null;
  if (plan) {
    const monthlySubtotal = plan.monthlyFee * plan.durationMonths;
    const upfrontDiscount =
      plan.billing === 'upfront'
        ? percentOf(monthlySubtotal, plan.upfrontDiscountPercent)
        : 0;
    servicePlan = {
      monthlySubtotal,
      upfrontDiscount,
      planTotal: monthlySubtotal - upfrontDiscount,
    };
  }
  return {
    lines,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    depositAmount: percentOf(total, input.depositPercent),
    servicePlan,
  };
}
