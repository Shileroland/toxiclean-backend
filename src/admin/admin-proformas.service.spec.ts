import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminProformasService,
  formatProformaReference,
} from './admin-proformas.service.js';
import type { ProformaDto } from './dto/admin-proforma.dto.js';

const survey = {
  areas: [
    {
      name: 'Kitchen',
      length: 4,
      width: 3,
      condition: 'furnished',
      containsStock: true,
    },
  ],
  landArea: 250,
  bushClearing: true,
  clearArea: 100,
  entryPoints: 6,
  baitStations: 12,
  followUpVisits: 3,
};

function setup(
  lead: object = {},
  existing: object | null = null,
  stored: object = {},
  paid: object[] = [],
) {
  const row = {
    id: 1,
    reference: 'TX-LD-000001',
    country: 'NG',
    status: 'contacted',
    booking: {
      fullName: 'Chinedu',
      phone: '+2348034567890',
      email: 'chinedu@example.com',
      address: '12 Allen Avenue',
      city: 'Ikeja',
      state: 'Lagos',
      customer: { name: 'Greenfield Hotels' },
    },
    quoteRequest: null,
    survey,
    ...lead,
  };
  const proformas = {
    findOne: vi.fn(({ where }: { where: { id?: number } }) =>
      Promise.resolve(
        where.id
          ? {
              id: 5,
              status: 'draft',
              lead: { id: 1, reference: 'TX-LD-000001' },
              ...stored,
            }
          : existing,
      ),
    ),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ id: 5, ...data })),
    update: vi.fn(() => Promise.resolve()),
    createQueryBuilder: vi.fn(() => {
      const qb = {
        where: () => qb,
        andWhere: () => qb,
        getCount: () => Promise.resolve(2),
      };
      return qb;
    }),
  };
  const leads = {
    findOne: vi.fn(() => Promise.resolve(row)),
    update: vi.fn(() => Promise.resolve()),
  };
  const payments = {
    find: vi.fn(() => Promise.resolve(paid)),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ id: 'pay1', ...data })),
  };
  const invoices = {
    linkedTo: vi.fn(() => Promise.resolve(null)),
    forProforma: vi.fn(() => Promise.resolve({ id: 'inv1' })),
  };
  const config = {
    get: vi.fn((key: string) =>
      key === 'BANK_DETAILS_NG'
        ? 'GTBank | Toxiclean Services Ltd | 0123445647'
        : undefined,
    ),
  };
  const service = new AdminProformasService(
    proformas as never,
    leads as never,
    payments as never,
    config as never,
    { record: vi.fn(() => Promise.resolve()) } as never,
    invoices as never,
  );
  return { service, proformas, leads, payments, invoices };
}

const inspection = {
  section: 'outdoor' as const,
  description: 'Inspection',
  quantity: 1,
  unit: 'each' as const,
  unitRate: 20_000,
};

const dto = (over: Partial<ProformaDto> = {}): ProformaDto =>
  ({
    customer: {
      name: 'Greenfield Hotels',
      phone: '+2348034567890',
      email: 'Chinedu@Example.com',
      address: '12 Allen Avenue, Ikeja, Lagos',
    },
    serviceAddress: '12 Allen Avenue, Ikeja, Lagos',
    currency: 'NGN',
    language: 'en',
    treatment: { areas: [], bushClearing: false },
    lines: [
      {
        section: 'outdoor',
        description: 'Inspection',
        quantity: 1,
        unit: 'each',
        unitRate: 20_000,
      },
    ],
    discountPercent: 0,
    taxPercent: 7.5,
    depositPercent: 50,
    validUntil: '2099-01-01',
    ...over,
  }) as ProformaDto;

const user = { id: 'u1' } as never;

describe('AdminProformasService', () => {
  it('formats references per country and year', () => {
    expect(formatProformaReference('NG', 2026, 1)).toBe('TXC-NG-2026-001');
    expect(formatProformaReference('BJ', 2027, 1234)).toBe('TXC-BJ-2027-1234');
  });

  it('starts from the survey’s measurements and the country’s rates', async () => {
    const { service } = setup();
    const d = await service.defaults(1);
    expect(d).toMatchObject({
      customer: {
        name: 'Greenfield Hotels',
        address: '12 Allen Avenue, Ikeja, Lagos',
      },
      currency: 'NGN',
      taxPercent: 7.5,
      depositPercent: 50,
      fromSurvey: true,
      rates: { indoorPerSqm: 5_000, inspection: 20_000 },
    });
    expect(d.treatment.areas).toHaveLength(1);
  });

  it('defaults Benin to XOF, French and no VAT, with rates left to staff', async () => {
    const { service } = setup({ country: 'BJ', survey: null });
    const d = await service.defaults(1);
    expect(d).toMatchObject({
      currency: 'XOF',
      language: 'fr',
      taxPercent: 0,
      fromSurvey: false,
      rates: { indoorPerSqm: null },
    });
  });

  it('numbers a new proforma and prices it on the server', async () => {
    const { service, proformas } = setup();
    await service.create(1, dto({ generate: true }), user);
    expect(proformas.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: expect.stringMatching(/^TXC-NG-\d{4}-003$/),
        status: 'ready',
        subtotal: 20_000,
        taxAmount: 1_500,
        total: 21_500,
        depositAmount: 10_750,
        customer: expect.objectContaining({ email: 'chinedu@example.com' }),
      }),
    );
  });

  it('saves an incomplete draft but won’t generate it', async () => {
    const { service, proformas } = setup();
    await service.create(1, dto({ lines: [], validUntil: null }), user);
    expect(proformas.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
    await expect(
      service.create(1, dto({ lines: [], generate: true }), user),
    ).rejects.toThrow(BadRequestException);
  });

  it('needs a unit rate on every charge to generate', async () => {
    const { service } = setup();
    const lines = [{ ...inspection, unitRate: 0 }];
    await expect(
      service.create(1, dto({ lines, generate: true }), user),
    ).rejects.toThrow('Enter a unit rate for every charge.');
  });

  it('allows one current proforma per lead', async () => {
    const { service } = setup({}, { id: 9, status: 'draft' });
    await expect(service.create(1, dto(), user)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses to edit a proforma once it has been sent', async () => {
    const { service } = setup({}, null, { status: 'sent' });
    await expect(service.update(5, dto())).rejects.toThrow(ConflictException);
  });

  it('gives a generated proforma a link token, but not a draft', async () => {
    const { service, proformas } = setup();
    await service.create(1, dto(), user);
    expect(proformas.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ shareToken: null }),
    );
    await service.create(1, dto({ generate: true }), user);
    expect(proformas.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        shareToken: expect.stringMatching(/^[\w-]{32}$/),
      }),
    );
  });

  it('marks a ready proforma as sent and the lead as Quoted', async () => {
    const { service, proformas, leads } = setup({}, null, {
      status: 'ready',
      lead: { id: 1, status: 'contacted' },
    });
    await service.markSent(5);
    expect(proformas.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ status: 'sent', sentAt: expect.any(Date) }),
    );
    expect(leads.update).toHaveBeenCalledWith(1, { status: 'quoted' });
  });

  it('won’t send a draft', async () => {
    const { service } = setup({}, null, { status: 'draft' });
    await expect(service.markSent(5)).rejects.toThrow(ConflictException);
  });

  it('has no document for a draft', async () => {
    const { service } = setup({}, null, { status: 'draft' });
    await expect(service.documentFor(5)).rejects.toThrow(NotFoundException);
  });

  it('shows the survey’s recommendation and the bank details on the document', async () => {
    const { service } = setup(
      {
        survey: {
          ...survey,
          recommendedTreatment: 'Bait stations and sealing.',
          estimatedScope: 'Kitchen, 12 m².',
        },
      },
      null,
      {
        status: 'ready',
        reference: 'TXC-NG-2026-001',
        country: 'NG',
        createdAt: new Date('2026-10-16T10:00:00Z'),
        generatedAt: null,
      },
    );
    await expect(service.documentFor(5)).resolves.toMatchObject({
      reference: 'TXC-NG-2026-001',
      issuedOn: '2026-10-16',
      included: 'Bait stations and sealing. Kitchen, 12 m².',
      bank: {
        bank: 'GTBank',
        accountName: 'Toxiclean Services Ltd',
        accountNumber: '0123445647',
      },
    });
  });

  it('records the customer’s response on a sent proforma only', async () => {
    const sent = setup({}, null, { status: 'sent' });
    await sent.service.recordResponse(5, {
      response: 'revision_requested',
      date: '2026-10-17',
      note: 'Fewer follow-up visits.',
    });
    expect(sent.proformas.update).toHaveBeenCalledWith(5, {
      status: 'revision_requested',
      responseDate: '2026-10-17',
      responseNote: 'Fewer follow-up visits.',
    });
    expect(sent.invoices.forProforma).not.toHaveBeenCalled();
    const draft = setup({}, null, { status: 'draft' });
    await expect(
      draft.service.recordResponse(5, {
        response: 'accepted',
        date: '2026-10-17',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('invoices the customer when they accept', async () => {
    const { service, invoices } = setup({}, null, { status: 'sent' });
    await service.recordResponse(5, {
      response: 'accepted',
      date: '2026-10-17',
    });
    expect(invoices.forProforma).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
      expect.objectContaining({ booking: expect.objectContaining({}) }),
    );
  });

  it('won’t take a response dated in the future', async () => {
    const { service } = setup({}, null, { status: 'sent' });
    await expect(
      service.recordResponse(5, { response: 'accepted', date: '2999-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('revises with the same reference and the next revision, replacing the old one', async () => {
    const { service, proformas } = setup({}, null, {
      status: 'revision_requested',
      reference: 'TXC-NG-2026-001',
      revision: 1,
      country: 'NG',
      lead: { id: 1, status: 'quoted' },
    });
    await service.revise(5, dto({ generate: true }), user);
    expect(proformas.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'TXC-NG-2026-001',
        revision: 2,
        status: 'ready',
        shareToken: expect.any(String),
      }),
    );
    expect(proformas.update).toHaveBeenCalledWith(5, { status: 'superseded' });
  });

  it('won’t revise a proforma that hasn’t been shared', async () => {
    const { service } = setup({}, null, {
      status: 'draft',
      lead: { id: 1, status: 'contacted' },
    });
    await expect(service.revise(5, dto(), user)).rejects.toThrow(
      ConflictException,
    );
  });

  it('takes payments once accepted, up to the balance', async () => {
    const accepted = {
      status: 'accepted',
      total: 645_000,
      depositAmount: 322_500,
      customer: { name: 'Greenfield Hotels' },
    };
    const { service, payments } = setup({}, null, accepted, [
      { amount: 300_000 },
    ]);
    const payment = {
      amount: 22_500,
      method: 'cash' as const,
      paidOn: '2026-10-20',
      account: 'Cash (Lagos office)',
    };
    await service.recordPayment(5, payment, user);
    expect(payments.save).toHaveBeenCalled();
    await expect(
      service.recordPayment(5, { ...payment, amount: 345_001 }, user),
    ).rejects.toThrow('The amount is more than the balance of the proforma.');
    const sent = setup({}, null, { status: 'sent' });
    await expect(sent.service.recordPayment(5, payment, user)).rejects.toThrow(
      ConflictException,
    );
  });

  it('counts the deposit as paid once it is covered', async () => {
    const { service } = setup(
      {},
      null,
      { status: 'accepted', depositAmount: 322_500 },
      [
        { id: 'p1', amount: 200_000 },
        { id: 'p2', amount: 122_500 },
      ],
    );
    await expect(service.get(5)).resolves.toMatchObject({
      amountPaid: 322_500,
      depositPaid: true,
    });
  });

  it('starts a bulk quotation from the requested products, with no deposit', async () => {
    const { service } = setup({
      booking: null,
      survey: null,
      quoteRequest: {
        fullName: 'Tunde',
        organisationName: 'Lagos Agro Supplies',
        phone: '+2348034567890',
        email: 'tunde@example.com',
        address: 'Warehouse 12',
        city: 'Ikeja',
        state: 'Lagos',
        deliveryMethod: 'delivery',
        items: [
          {
            productSlug: 'solo-425',
            productName: 'Solo 425 Backpack Sprayer',
            quantity: 20,
          },
        ],
      },
    });
    await expect(service.defaults(1)).resolves.toMatchObject({
      customer: { name: 'Lagos Agro Supplies' },
      products: [
        {
          productName: 'Solo 425 Backpack Sprayer',
          quantity: 20,
          unitPrice: null,
        },
      ],
      fulfilment: { method: 'delivery', address: 'Warehouse 12, Ikeja, Lagos' },
      depositPercent: 0,
    });
  });
});
