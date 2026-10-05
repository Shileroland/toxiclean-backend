import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Booking } from '../bookings/booking.entity.js';
import { AdminBookingsService } from './admin-bookings.service.js';

const fumigator = { id: 'f1', fullName: 'Emmanuel Kalu' };

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 7,
    reference: 'TX-BK-000007',
    status: 'requested',
    country: 'NG',
    serviceCategory: 'fumigation',
    serviceSlug: 'general',
    serviceName: 'General Fumigation',
    propertyType: 'residential',
    issue: 'Rats',
    photos: [
      {
        fileName: 'secret.jpg',
        originalName: 'kitchen.jpg',
        mimeType: 'image/jpeg',
        size: 10,
      },
    ],
    fullName: 'Ada Obi',
    phone: '+2348000000000',
    email: 'ada@example.com',
    preferredContactMethod: 'phone',
    state: 'Lagos',
    city: 'Ikeja',
    address: '1 Allen Ave',
    preferredDate: '2026-10-10',
    preferredTime: 'morning',
    scheduledDate: null,
    scheduledTime: null,
    endDate: null,
    endTime: null,
    assignedFumigator: null,
    fumigators: [],
    customer: null,
    user: null,
    treatmentPlan: null,
    followUpReason: null,
    followUpOf: null,
    rescheduleRequest: null,
    cancellationRequest: null,
    completedAt: null,
    closedAt: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    ...overrides,
  } as Booking;
}

function setup(row: Booking | null) {
  const repo = {
    findOne: vi.fn(() => Promise.resolve(row)),
    // Like TypeORM, saving fills in the id on the same object.
    save: vi.fn((b: Booking) =>
      Promise.resolve(Object.assign(b, { id: b.id ?? 8 })),
    ),
    create: vi.fn((data: object) => ({ ...data }) as Booking),
    update: vi.fn(() => Promise.resolve()),
  };
  const customers = {
    forBooking: vi.fn(() => Promise.resolve({ id: 'c1' })),
  };
  const fumigators = {
    forAssignment: vi.fn(() => Promise.resolve([fumigator])),
  };
  const service = new AdminBookingsService(
    repo as never,
    customers as never,
    fumigators as never,
    {} as never,
  );
  return { service, repo, customers, fumigators };
}

const schedule = {
  date: '2026-10-12',
  startTime: '09:00',
  endTime: '11:00',
  fumigatorIds: ['f1'],
};

describe('AdminBookingsService', () => {
  it('schedules a website request and links it to a customer', async () => {
    const { service, customers } = setup(booking());
    const job = await service.schedule(7, schedule);

    expect(job).toMatchObject({
      status: 'scheduled',
      scheduledDate: '2026-10-12',
      scheduledTime: '09:00',
      endDate: '2026-10-12',
      endTime: '11:00',
      assignedFumigator: 'Emmanuel Kalu',
      customer: { id: 'c1' },
    });
    expect(customers.forBooking).toHaveBeenCalled();
    // Photo file names never leave the server.
    expect(job.photos).toEqual([
      { originalName: 'kitchen.jpg', mimeType: 'image/jpeg', size: 10 },
    ]);
  });

  it('rejects a job that ends before it starts', async () => {
    const { service } = setup(booking());
    await expect(
      service.schedule(7, { ...schedule, endTime: '08:00' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.schedule(7, { ...schedule, endDate: '2026-10-11' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts multi-day jobs that end earlier in the day', async () => {
    const { service } = setup(booking());
    const job = await service.schedule(7, {
      ...schedule,
      endDate: '2026-10-14',
      endTime: '08:00',
    });
    expect(job).toMatchObject({ endDate: '2026-10-14', endTime: '08:00' });
  });

  it('moves a job one step at a time', async () => {
    const scheduled = setup(booking({ status: 'scheduled' }));
    await expect(
      scheduled.service.changeStatus(7, { status: 'on_the_way' }),
    ).resolves.toMatchObject({ status: 'on_the_way' });

    const skipping = setup(booking({ status: 'scheduled' }));
    await expect(
      skipping.service.changeStatus(7, { status: 'completed' }),
    ).rejects.toThrow(ConflictException);
  });

  it('stamps completion and closing', async () => {
    const done = await setup(
      booking({ status: 'in_progress' }),
    ).service.changeStatus(7, { status: 'completed' });
    expect(done.completedAt).toBeInstanceOf(Date);

    const closed = await setup(
      booking({
        status: 'completed',
        rescheduleRequest: {
          preferredDate: '2026-10-20',
          preferredTime: 'morning',
          requestedAt: '',
        },
      }),
    ).service.changeStatus(7, { status: 'closed' });
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(closed.rescheduleRequest).toBeNull();
  });

  it('only flags completed jobs for follow-up', async () => {
    const { service } = setup(booking({ status: 'scheduled' }));
    await expect(
      service.markFollowUpRequired(7, 'Still active'),
    ).rejects.toThrow(ConflictException);

    const ok = await setup(
      booking({ status: 'completed' }),
    ).service.markFollowUpRequired(7, 'Still active');
    expect(ok).toMatchObject({
      status: 'follow_up_required',
      followUpReason: 'Still active',
    });
  });

  it('books the follow-up as a new job and closes the original', async () => {
    const original = booking({
      status: 'follow_up_required',
      followUpReason: 'Second round needed',
      treatmentPlan: 'Gel bait',
    });
    const { service, repo } = setup(original);
    const followUp = await service.scheduleFollowUp(7, schedule);

    expect(followUp).toMatchObject({
      status: 'scheduled',
      scheduledDate: '2026-10-12',
      treatmentPlan: 'Gel bait',
      address: '1 Allen Ave',
      followUpOf: { id: 7, reference: 'TX-BK-000007' },
    });
    expect(followUp.issue).toContain('Second round needed');
    expect(repo.update).toHaveBeenCalledWith(expect.any(Number), {
      reference: expect.stringMatching(/^TX-BK-\d{6}$/),
    });
    expect(original.status).toBe('closed');
    expect(original.closedAt).toBeInstanceOf(Date);
  });

  it('404s for unknown jobs', async () => {
    await expect(setup(null).service.get(1)).rejects.toThrow(NotFoundException);
  });
});
