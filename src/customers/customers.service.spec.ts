import { ConflictException } from '@nestjs/common';
import { CustomersService } from './customers.service.js';

function setup(
  state: { customer?: object | null; own?: object[]; account?: object[] } = {},
) {
  const customers = {
    find: vi.fn(() => Promise.resolve([])),
    findOne: vi.fn(() => Promise.resolve(state.customer ?? null)),
    exists: vi.fn(() => Promise.resolve(Boolean(state.customer))),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ id: 'c1', ...data })),
  };
  const locations = {
    find: vi.fn(() => Promise.resolve(state.own ?? [])),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ id: 'l-new', ...data })),
  };
  const users = { findOne: vi.fn(() => Promise.resolve(null)) };
  const addresses = { find: vi.fn(() => Promise.resolve(state.account ?? [])) };
  const service = new CustomersService(
    customers as never,
    locations as never,
    users as never,
    addresses as never,
  );
  return { service, customers, locations };
}

const lekki = {
  country: 'NG' as const,
  state: 'Lagos',
  city: 'Lekki',
  address: '42 Admiralty Way',
};

describe('CustomersService', () => {
  it('treats % and _ in searches literally', async () => {
    const { service, customers } = setup();
    await service.search('NG', '50%_off');
    const [{ where }] = customers.find.mock.calls[0] as unknown as [
      { where: { name: { value: string } }[] },
    ];
    expect(where[0].name.value).toBe('%50\\%\\_off%');
  });

  it('refuses a second customer with the same email', async () => {
    const { service } = setup({ customer: { id: 'c1' } });
    await expect(
      service.create({
        type: 'business',
        name: 'Lobaloba Enterprise',
        phone: '+2348167493068',
        email: 'gabriel@example.com',
        country: 'NG',
        preferredContactMethod: 'whatsapp',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('merges account addresses into saved locations without duplicates', async () => {
    const { service } = setup({
      customer: { id: 'c1', user: { id: 'u1' } },
      own: [{ id: 'l1', ...lekki }],
      account: [
        { id: 'a1', ...lekki, address: '42 ADMIRALTY WAY' },
        { id: 'a2', ...lekki, city: 'Ikeja', address: '12 Allen Ave' },
      ],
    });
    const locations = await service.listLocations('c1');
    expect(locations.map((l) => l.id)).toEqual(['l1', 'a2']);
  });

  it('reuses a matching location instead of saving it twice', async () => {
    const { service, locations } = setup({
      customer: { id: 'c1', user: null },
      own: [{ id: 'l1', ...lekki }],
    });
    await expect(service.addLocation('c1', lekki)).resolves.toMatchObject({
      id: 'l1',
    });
    expect(locations.save).not.toHaveBeenCalled();
  });
});
