import { agreementStatus, slugify } from './catalog.service.js';
import { stockStatus, summarise } from './inventory.service.js';

const level = (
  location: string,
  onHand: number,
  reserved: number,
  reorderLevel: number | null,
) => ({ location, onHand, reserved, reorderLevel }) as never;

describe('stock status', () => {
  it('is out at zero available, low at or under the reorder level', () => {
    expect(stockStatus(0, 5)).toBe('out_of_stock');
    expect(stockStatus(5, 5)).toBe('low_stock');
    expect(stockStatus(6, 5)).toBe('in_stock');
    expect(stockStatus(3, null)).toBe('in_stock');
  });

  it('sums locations and reports how many need restocking', () => {
    const s = summarise(
      [level('Ikeja Branch', 22, 4, 10), level('Lekki Branch', 10, 2, 10)],
      ['Ikeja Branch', 'Lekki Branch'],
    );
    expect(s).toMatchObject({
      onHand: 32,
      reserved: 6,
      available: 26,
      reorderLevel: null,
      status: 'low_stock',
      affectedLocations: 1,
      locationCount: 2,
    });
  });

  it('counts a location with no stock row as out of stock', () => {
    const s = summarise([], ['Ikeja Branch']);
    expect(s).toMatchObject({ available: 0, status: 'out_of_stock' });
  });
});

describe('agreementStatus', () => {
  it('is not recorded, expired, expiring within 30 days, or active', () => {
    expect(agreementStatus(null, '2026-11-04')).toBe('not_recorded');
    expect(agreementStatus('2026-11-03', '2026-11-04')).toBe('expired');
    expect(agreementStatus('2026-12-04', '2026-11-04')).toBe('expiring');
    expect(agreementStatus('2026-12-05', '2026-11-04')).toBe('active');
  });
});

describe('slugify', () => {
  it('makes a URL name from the product name', () => {
    expect(slugify('Solo Pressure Sprayer (5L)')).toBe(
      'solo-pressure-sprayer-5l',
    );
    expect(slugify('Insecticide Résiduel')).toBe('insecticide-residuel');
  });
});
