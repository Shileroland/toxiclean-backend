import type { Currency } from '../quote-requests/quote-request.entity.js';

/** Unit rates a new proforma starts with; staff can change any of them per proforma. */
export type RateCard = {
  /** Per m² of indoor area. */
  indoorPerSqm: number | null;
  landPerSqm: number | null;
  bushClearingPerSqm: number | null;
  entryPoint: number | null;
  baitStation: number | null;
  inspection: number | null;
  followUpVisit: number | null;
};

/**
 * Prices are set per currency and never converted. Benin (XOF) rates haven't been
 * agreed yet, so those proformas start blank and staff enter the rates.
 */
export const RATE_CARDS: Record<Currency, RateCard> = {
  NGN: {
    indoorPerSqm: 5_000,
    landPerSqm: 800,
    bushClearingPerSqm: 500,
    entryPoint: 6_000,
    baitStation: 4_000,
    inspection: 20_000,
    followUpVisit: 12_000,
  },
  XOF: {
    indoorPerSqm: null,
    landPerSqm: null,
    bushClearingPerSqm: null,
    entryPoint: null,
    baitStation: null,
    inspection: null,
    followUpVisit: null,
  },
};

/** Tax per country: Nigeria VAT 7.5%; the Benin entity isn't VAT-registered yet. */
export const DEFAULT_TAX_PERCENT = { NG: 7.5, BJ: 0 } as const;

export const DEFAULT_DEPOSIT_PERCENT = 50;
export const QUOTE_VALIDITY_DAYS = 30;
/** Discount when a service plan is paid upfront. */
export const DEFAULT_UPFRONT_DISCOUNT_PERCENT = 5;
