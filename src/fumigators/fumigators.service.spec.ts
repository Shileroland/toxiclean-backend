import { BadRequestException, ConflictException } from '@nestjs/common';
import { certificateStatus, FumigatorsService } from './fumigators.service.js';

function setup(
  fumigator: object | null = null,
  bookings: object[][] = [[], [], []],
) {
  const row = fumigator && {
    id: 'f1',
    fullName: 'Daniel Okafor',
    phone: '+2348034567890',
    country: 'NG',
    branch: 'Ikeja Branch',
    workStart: '08:00',
    workEnd: '17:00',
    certificates: [],
    ...fumigator,
  };
  const fumigators = {
    findOne: vi.fn(() => Promise.resolve(row)),
    exists: vi.fn(() => Promise.resolve(false)),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve(data)),
    update: vi.fn(() => Promise.resolve()),
  };
  const certificates = {
    create: vi.fn((data: object) => data),
    save: vi.fn(() => Promise.resolve()),
  };
  // details() runs three booking queries: the period, upcoming, then recent work.
  let call = 0;
  const bookingRepo = {
    createQueryBuilder: vi.fn(() => {
      const result = bookings[call++] ?? [];
      const qb = {
        innerJoin: () => qb,
        leftJoinAndSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        orderBy: () => qb,
        addOrderBy: () => qb,
        take: () => qb,
        getMany: () => Promise.resolve(result),
      };
      return qb;
    }),
  };
  const storage = {
    put: vi.fn(() => Promise.resolve('local')),
    delete: vi.fn(),
  };
  const users = {
    findOne: vi.fn(() => Promise.resolve(null)),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ id: 'u1', ...data })),
    createQueryBuilder: vi.fn(() => {
      const qb = { where: () => qb, getExists: () => Promise.resolve(false) };
      return qb;
    }),
  };
  const auth = { requestPasswordReset: vi.fn(() => Promise.resolve()) };
  const service = new FumigatorsService(
    fumigators as never,
    certificates as never,
    bookingRepo as never,
    storage as never,
    users as never,
    auth as never,
  );
  return { service, fumigators, certificates, storage, users, auth };
}

const base = {
  fullName: 'Samuel Adeyemi',
  phone: '+2348033149678',
  country: 'NG' as const,
};

describe('certificateStatus', () => {
  it('is expired, expiring within 30 days, or valid', () => {
    expect(certificateStatus('2026-11-02', '2026-11-03')).toBe('expired');
    expect(certificateStatus('2026-12-03', '2026-11-03')).toBe('expiring');
    expect(certificateStatus('2026-12-04', '2026-11-03')).toBe('valid');
  });
});

describe('FumigatorsService', () => {
  it('only takes a branch from the fumigator’s country', async () => {
    const { service } = setup();
    expect(() => service.create({ ...base, branch: 'Cotonou Branch' })).toThrow(
      BadRequestException,
    );
    await expect(
      service.create({ ...base, branch: 'Ikeja Branch' }),
    ).resolves.toMatchObject({
      branch: 'Ikeja Branch',
      availability: 'available',
    });
  });

  it('needs working hours that end after they start', () => {
    const { service } = setup();
    expect(() =>
      service.create({ ...base, workStart: '17:00', workEnd: '08:00' }),
    ).toThrow('Working hours must end after they start.');
  });

  it('drops the branch when a fumigator moves country', async () => {
    const { service, fumigators } = setup({});
    await service.update('f1', { country: 'BJ' });
    expect(fumigators.save).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'BJ', branch: null }),
    );
  });

  it('refuses a certificate that expires before it was issued', async () => {
    const { service, certificates } = setup({});
    await expect(
      service.addCertificate('f1', {
        name: 'Pest Control Safety Training',
        issuingOrganisation: 'ABC Training Institute',
        issueDate: '2026-03-14',
        expiryDate: '2025-03-14',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(certificates.save).not.toHaveBeenCalled();
  });

  it('works out performance from the period’s jobs', async () => {
    const past = '2026-10-01';
    const period = [
      { status: 'completed', scheduledDate: past },
      { status: 'follow_up_required', scheduledDate: past },
      { status: 'scheduled', scheduledDate: past },
      // Later this period, not yet due: not counted against them.
      { status: 'scheduled', scheduledDate: '2999-01-01' },
    ];
    const { service } = setup({}, [period, [], []]);
    const d = await service.details('f1');
    expect(d.performance).toEqual({
      days: 30,
      completedBookings: 2,
      completionRate: 67,
      followUpsRequired: 1,
    });
  });

  describe('invite', () => {
    const person = { email: 'daniel@example.com', active: true, user: null };

    it('creates a fumigator login and emails a set-password link', async () => {
      const { service, users, fumigators, auth } = setup(person);
      await service.invite('f1');
      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'daniel@example.com',
          role: 'fumigator',
          passwordHash: null,
        }),
      );
      expect(fumigators.update).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({
          user: expect.objectContaining({ id: 'u1' }),
        }),
      );
      expect(auth.requestPasswordReset).toHaveBeenCalledWith(
        'daniel@example.com',
        true,
      );
    });

    it('needs an email on the profile', async () => {
      const { service, auth } = setup({ ...person, email: null });
      await expect(service.invite('f1')).rejects.toThrow(BadRequestException);
      expect(auth.requestPasswordReset).not.toHaveBeenCalled();
    });

    it('won’t take over a customer or staff account', async () => {
      const { service, users, auth } = setup(person);
      users.findOne.mockResolvedValueOnce({
        id: 'u9',
        role: 'customer',
      } as never);
      await expect(service.invite('f1')).rejects.toThrow(ConflictException);
      expect(auth.requestPasswordReset).not.toHaveBeenCalled();
    });
  });
});
