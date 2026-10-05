import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from '../auth/session.guard.js';
import { AdminService } from './admin.service.js';

function contextFor(authorization?: string) {
  const request = { headers: { authorization } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('AdminGuard', () => {
  const auth = {
    getSessionUser: vi.fn((token: string) =>
      Promise.resolve(
        token === 'admin'
          ? { role: 'admin' }
          : token === 'super'
            ? { role: 'super_admin' }
            : token === 'customer'
              ? { role: 'customer' }
              : null,
      ),
    ),
  };
  const guard = new AdminGuard(auth as never);

  it('lets admins and super admins through', async () => {
    await expect(guard.canActivate(contextFor('Bearer admin'))).resolves.toBe(
      true,
    );
    await expect(guard.canActivate(contextFor('Bearer super'))).resolves.toBe(
      true,
    );
  });

  it('rejects customers and signed-out visitors', async () => {
    await expect(
      guard.canActivate(contextFor('Bearer customer')),
    ).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('AdminService.overview', () => {
  const at = (iso: string) => new Date(iso);
  const bookings = {
    count: vi.fn(() => Promise.resolve(2)),
    find: vi.fn(() =>
      Promise.resolve([
        {
          id: 1,
          reference: 'TX-BK-000001',
          serviceName: 'General Fumigation',
          fullName: 'Ada Obi',
          createdAt: at('2026-10-01T10:00:00Z'),
        },
      ]),
    ),
  };
  const quoteRequests = {
    count: vi.fn(() => Promise.resolve(4)),
    find: vi.fn(() =>
      Promise.resolve([
        {
          id: 9,
          reference: 'TX-PR-000009',
          organisationName: null,
          fullName: 'Koffi Mensah',
          createdAt: at('2026-10-02T10:00:00Z'),
        },
      ]),
    ),
  };
  const service = new AdminService(bookings as never, quoteRequests as never);

  it('counts per country and merges recent activity newest first', async () => {
    const overview = await service.overview('BJ');

    expect(overview).toMatchObject({
      country: 'BJ',
      todayJobs: 2,
      openLeads: 2,
      pendingRequests: 4,
      lowStock: null,
      revenue: null,
    });
    expect(overview.recentActivity.map((a) => a.reference)).toEqual([
      'TX-PR-000009',
      'TX-BK-000001',
    ]);
    expect(overview.recentActivity[0]).toMatchObject({
      kind: 'request',
      title: 'Koffi Mensah',
    });
    const wheres = [...bookings.count.mock.calls, ...bookings.find.mock.calls]
      .map((call) => (call as unknown as [{ where: object | object[] }])[0])
      .flatMap(({ where }) => where);
    for (const where of wheres)
      expect(where).toEqual(expect.objectContaining({ country: 'BJ' }));
  });
});
