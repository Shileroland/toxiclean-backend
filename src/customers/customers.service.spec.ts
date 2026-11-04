import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service.js';

function setup(
  state: {
    customer?: object | null;
    own?: object[];
    account?: object[];
    linkedUser?: object;
  } = {},
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
    findOne: vi.fn(() => Promise.resolve(state.own?.[0] ?? null)),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ id: 'l-new', ...data })),
  };
  const users = {
    findOne: vi.fn(() => Promise.resolve(state.linkedUser ?? null)),
  };
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

  it('marks the website account’s addresses as not editable', async () => {
    const { service } = setup({
      customer: { id: 'c1', user: { id: 'u1' } },
      own: [{ id: 'l1', ...lekki }],
      account: [{ id: 'a2', ...lekki, address: '12 Allen Ave' }],
    });
    const locations = await service.listLocations('c1');
    expect(locations.map((l) => l.editable)).toEqual([true, false]);
  });

  it('re-links the website account when the email changes', async () => {
    const { service, customers } = setup({
      customer: { id: 'c1', email: 'old@example.com', user: null },
      linkedUser: { id: 'u9' },
    });
    customers.exists.mockResolvedValue(false);
    await service.update('c1', {
      type: 'individual',
      name: 'Tobiloba Olabode',
      phone: '+2348167493068',
      email: 'new@example.com',
      country: 'NG',
      preferredContactMethod: 'whatsapp',
    });
    expect(customers.save).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', user: { id: 'u9' } }),
    );
  });

  it('refuses to change the email to another customer’s', async () => {
    const { service } = setup({
      customer: { id: 'c1', email: 'old@example.com', user: null },
    });
    await expect(
      service.update('c1', {
        type: 'individual',
        name: 'Tobiloba Olabode',
        phone: '+2348167493068',
        email: 'taken@example.com',
        country: 'NG',
        preferredContactMethod: 'whatsapp',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to edit a location into one the customer already has', async () => {
    const { service, locations } = setup({
      customer: { id: 'c1', user: null },
      own: [
        { id: 'l1', ...lekki },
        { id: 'l2', ...lekki, address: '12 Allen Ave' },
      ],
    });
    locations.findOne.mockResolvedValue({
      id: 'l2',
      ...lekki,
      address: '12 Allen Ave',
    });
    await expect(
      service.updateLocation('c1', 'l2', {
        ...lekki,
        address: '42 admiralty way',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('only edits the customer’s own locations', async () => {
    const { service, locations } = setup({
      customer: { id: 'c1', user: null },
    });
    await expect(service.updateLocation('c1', 'a2', lekki)).rejects.toThrow(
      NotFoundException,
    );
    expect(locations.save).not.toHaveBeenCalled();
  });
});
