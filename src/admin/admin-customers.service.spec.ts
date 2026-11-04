import { AdminCustomersService } from './admin-customers.service.js';

const customer = {
  id: 'c1',
  number: 7,
  type: 'business',
  name: 'Greenfield Hotels',
  email: 'hello@greenfield.example',
  user: { language: 'fr' },
  createdAt: new Date('2026-09-01T09:00:00Z'),
};

function setup() {
  const bookings = {
    createQueryBuilder: vi.fn(() => {
      const qb = {
        where: () => qb,
        orWhere: () => qb,
        orderBy: () => qb,
        take: () => qb,
        getMany: () =>
          Promise.resolve([
            {
              id: 4,
              reference: 'TX-BK-000004',
              serviceName: 'Fumigation',
              address: '24 Admiralty Way',
              city: 'Lekki',
              state: 'Lagos',
              preferredDate: '2026-10-16',
              scheduledDate: null,
              status: 'completed',
              createdAt: new Date('2026-09-10T09:00:00Z'),
              completedAt: new Date('2026-09-18T13:30:00Z'),
            },
          ]),
      };
      return qb;
    }),
  };
  const requests = {
    find: vi.fn(() =>
      Promise.resolve([
        {
          id: 9,
          reference: 'TX-PR-000009',
          status: 'confirmed',
          currency: 'NGN',
          items: [
            { productName: 'Knapsack Sprayer', quantity: 1 },
            { productName: 'Gloves', quantity: 4 },
          ],
          createdAt: new Date('2026-09-20T10:00:00Z'),
          contacts: [
            {
              method: 'whatsapp',
              note: 'Confirmed the delivery address.',
              contactedAt: new Date('2026-10-08T13:30:00Z'),
              loggedBy: { fullName: 'Daniel Oyewole' },
            },
          ],
          payments: [],
        },
      ]),
    ),
  };
  const people = {
    get: vi.fn(() => Promise.resolve(customer)),
    listLocations: vi.fn(() => Promise.resolve([])),
  };
  const service = new AdminCustomersService(
    {} as never,
    bookings as never,
    requests as never,
    people as never,
  );
  return { service };
}

describe('AdminCustomersService', () => {
  it('returns the reference, account language and recent activity', async () => {
    const { service } = setup();
    const details = await service.get('c1');
    expect(details).toMatchObject({
      reference: 'TX-CU-000007',
      hasAccount: true,
      language: 'fr',
      recentRequests: [{ title: 'Knapsack Sprayer + 1 more' }],
      recentBookings: [
        { place: '24 Admiralty Way, Lekki, Lagos', date: '2026-10-16' },
      ],
    });
    expect(details).not.toHaveProperty('user');
  });

  it('lists the history newest first', async () => {
    const { service } = setup();
    const { history } = await service.get('c1');
    expect(history.map((h) => h.kind)).toEqual([
      'contact_logged',
      'request_submitted',
      'booking_completed',
      'booking_requested',
      'customer_added',
    ]);
    expect(history[0]).toMatchObject({
      method: 'whatsapp',
      by: 'Daniel Oyewole',
      reference: 'TX-PR-000009',
    });
  });
});
