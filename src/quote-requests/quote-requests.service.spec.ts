import {
  formatReference,
  QuoteRequestsService,
} from './quote-requests.service.js';
import type { CreateQuoteRequestDto } from './dto/create-quote-request.dto.js';

describe('formatReference', () => {
  it('pads the id to six digits', () => {
    expect(formatReference(123)).toBe('TX-PR-000123');
    expect(formatReference(1234567)).toBe('TX-PR-1234567');
  });
});

describe('QuoteRequestsService', () => {
  const repo = {
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ ...data, id: 42 })),
    update: vi.fn(() => Promise.resolve()),
  };
  const mail = { quoteRequestReceived: vi.fn(() => Promise.resolve()) };
  const service = new QuoteRequestsService(repo as never, mail as never);

  const base = {
    items: [
      {
        productSlug: 'swingfog-sn-50',
        productName: 'Swingfog SN 50',
        quantity: 3,
      },
    ],
    fullName: ' Ikechukwu Okafor ',
    phone: '+2349119537489',
    email: 'Oyoamala@Gmail.com',
    country: 'NG',
    deliveryMethod: 'pickup',
    state: 'Lagos',
    city: 'Ikeja',
    address: '21 Market Road',
    preferredContactMethod: 'whatsapp',
  } satisfies CreateQuoteRequestDto;

  beforeEach(() => vi.clearAllMocks());

  it('saves the request and returns its reference', async () => {
    await expect(service.create(base)).resolves.toEqual({
      reference: 'TX-PR-000042',
    });
    expect(repo.update).toHaveBeenCalledWith(42, { reference: 'TX-PR-000042' });
  });

  it('normalises input and drops address fields for pickup', async () => {
    await service.create(base);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Ikechukwu Okafor',
        email: 'oyoamala@gmail.com',
        state: null,
        city: null,
        address: null,
      }),
    );
  });

  it('keeps address fields for delivery', async () => {
    await service.create({ ...base, deliveryMethod: 'delivery' });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'Lagos',
        city: 'Ikeja',
        address: '21 Market Road',
      }),
    );
  });

  it('stores product requests with their kind and estimated prices', async () => {
    await service.create({
      ...base,
      kind: 'product',
      items: [
        {
          productSlug: 'swingfog-sn-50',
          productName: 'Swingfog SN 50',
          quantity: 2,
          unitPrice: 450000,
        },
      ],
    });
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'product',
        items: [expect.objectContaining({ unitPrice: 450000, quantity: 2 })],
      }),
    );
  });

  it('emails the confirmation with the reference, language and account state', async () => {
    await service.create(base, 'user-1', 'fr');
    expect(mail.quoteRequestReceived).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'TX-PR-000042', kind: 'bulk' }),
      'fr',
      true,
    );
  });

  it('defaults to a bulk quote in NGN', async () => {
    await service.create(base);
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'bulk', currency: 'NGN' }),
    );
  });

  it('keeps the currency the prices were shown in', async () => {
    await service.create({ ...base, kind: 'product', currency: 'XOF' });
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: 'XOF' }),
    );
  });
});
