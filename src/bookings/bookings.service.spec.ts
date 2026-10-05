import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  BookingsService,
  formatBookingReference,
  todayInWat,
} from './bookings.service.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';
import { detectImageType, storeBookingPhotos } from './photo-storage.js';

const storage = { put: vi.fn(() => Promise.resolve('local')) };

describe('booking helpers', () => {
  it('formats references', () => {
    expect(formatBookingReference(7)).toBe('TX-BK-000007');
  });

  it('uses West Africa Time for "today"', () => {
    // 23:30 UTC is already the next day in Lagos and Cotonou.
    expect(todayInWat(new Date('2026-10-01T23:30:00Z'))).toBe('2026-10-02');
    expect(todayInWat(new Date('2026-10-01T10:00:00Z'))).toBe('2026-10-01');
  });

  it('detects PNG and JPEG by their bytes, not their names', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]);
    expect(detectImageType(png)).toBe('image/png');
    expect(detectImageType(jpeg)).toBe('image/jpeg');
    expect(detectImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });

  it('rejects non-image uploads before writing anything', async () => {
    await expect(
      storeBookingPhotos(
        [
          {
            buffer: Buffer.from('MZ fake exe'),
            originalname: 'photo.png',
            size: 11,
          },
        ],
        storage as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('stores valid photos under bookings/ with random names', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]);
    const [photo] = await storeBookingPhotos(
      [{ buffer: jpeg, originalname: 'roof.jpg', size: 5 }],
      storage as never,
    );
    expect(photo).toMatchObject({ storage: 'local', mimeType: 'image/jpeg' });
    expect(storage.put).toHaveBeenCalledWith(
      `bookings/${photo.fileName}`,
      jpeg,
      'image/jpeg',
    );
  });
});

describe('BookingsService', () => {
  const repo = {
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ ...data, id: 3 })),
    update: vi.fn(() => Promise.resolve()),
  };
  const mail = { bookingReceived: vi.fn(() => Promise.resolve()) };
  const service = new BookingsService(
    repo as never,
    mail as never,
    storage as never,
  );

  const dto = {
    serviceCategory: 'fumigation-pest-control',
    serviceSlug: 'termite-control',
    serviceName: 'Termite Control',
    propertyType: 'residential',
    issue: ' Termites in the roof. ',
    fullName: 'Daniel Adebayo',
    phone: '+2348034567890',
    email: 'Daniel@Example.com',
    preferredContactMethod: 'whatsapp',
    country: 'NG',
    state: 'Lagos',
    city: 'Ikeja',
    address: '24 Allen Avenue',
    preferredDate: '2099-01-01',
    preferredTime: 'morning',
  } satisfies CreateBookingDto;

  it('stores the booking and returns its reference', async () => {
    await expect(service.create(dto, [], 'user-1')).resolves.toEqual({
      reference: 'TX-BK-000003',
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: 'Termites in the roof.',
        email: 'daniel@example.com',
        user: { id: 'user-1' },
      }),
    );
  });

  it('emails the customer in their language', async () => {
    await service.create(dto, [], undefined, 'fr');
    expect(mail.bookingReceived).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'TX-BK-000003' }),
      'fr',
    );
  });

  it('rejects dates in the past', async () => {
    mail.bookingReceived.mockClear();
    await expect(
      service.create({ ...dto, preferredDate: '2020-01-01' }, []),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mail.bookingReceived).not.toHaveBeenCalled();
  });
});

describe('BookingsService changes', () => {
  const scheduled = () => ({
    id: 3,
    reference: 'TX-BK-000003',
    status: 'scheduled',
    scheduledDate: '2099-01-05',
    scheduledTime: '10:00',
    rescheduleRequest: null,
    cancellationRequest: null,
    photos: [
      {
        fileName: 'a.jpg',
        storage: 's3',
        mimeType: 'image/jpeg',
        size: 5,
        originalName: 'a.jpg',
      },
    ],
  });

  function setup(row: object | null) {
    const repo = {
      findOne: vi.fn(() => Promise.resolve(row)),
      update: vi.fn(() => Promise.resolve()),
    };
    const mail = { bookingChangeRequested: vi.fn(() => Promise.resolve()) };
    const files = {
      get: vi.fn(() => Promise.resolve(Readable.from(['x']))),
    };
    const service = new BookingsService(
      repo as never,
      mail as never,
      files as never,
    );
    return { service, repo, mail, files };
  }

  it('hides staff notes and internal statuses from customers', async () => {
    const { service } = setup(null);
    const row = {
      ...scheduled(),
      status: 'follow_up_required',
      treatmentPlan: 'Gel bait',
      followUpReason: 'Still active',
      user: { id: 'u1' },
    };
    Object.assign(service, {
      bookings: { find: vi.fn(() => Promise.resolve([row])) },
    });
    const [booking] = await service.listForUser('u1');
    expect(booking).toMatchObject({ status: 'completed', photoCount: 1 });
    expect(booking).not.toHaveProperty('treatmentPlan');
    expect(booking).not.toHaveProperty('followUpReason');
    expect(booking).not.toHaveProperty('photos');
  });

  it("treats another customer's booking as not found", async () => {
    const { service, repo } = setup(null);
    await expect(service.requestCancellation('u2', 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 3, user: { id: 'u2' } },
    });
  });

  it('records a reschedule request and tells the team', async () => {
    const { service, repo, mail } = setup(scheduled());
    await expect(
      service.requestReschedule('u1', 3, '2099-02-01', 'morning'),
    ).resolves.toEqual({ reference: 'TX-BK-000003' });
    expect(repo.update).toHaveBeenCalledWith(3, {
      rescheduleRequest: expect.objectContaining({
        preferredDate: '2099-02-01',
        preferredTime: 'morning',
      }),
    });
    expect(mail.bookingChangeRequested).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'TX-BK-000003' }),
      'reschedule',
    );
  });

  it('only reschedules scheduled bookings, once at a time, to a future date', async () => {
    await expect(
      setup({ ...scheduled(), status: 'requested' }).service.requestReschedule(
        'u1',
        3,
        '2099-02-01',
        'morning',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup({
        ...scheduled(),
        cancellationRequest: { reason: null, requestedAt: 'x' },
      }).service.requestReschedule('u1', 3, '2099-02-01', 'morning'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup(scheduled()).service.requestReschedule(
        'u1',
        3,
        '2020-01-01',
        'morning',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets requested and scheduled bookings ask for cancellation', async () => {
    const { service, repo } = setup({ ...scheduled(), status: 'requested' });
    await service.requestCancellation('u1', 3, '  Moving house ');
    expect(repo.update).toHaveBeenCalledWith(3, {
      cancellationRequest: expect.objectContaining({ reason: 'Moving house' }),
    });
    await expect(
      setup({
        ...scheduled(),
        status: 'in_progress',
      }).service.requestCancellation('u1', 3),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('streams photos from where they were stored', async () => {
    const { service, files } = setup(scheduled());
    await service.openPhoto('u1', 3, 0);
    expect(files.get).toHaveBeenCalledWith('bookings/a.jpg', 's3');
    await expect(service.openPhoto('u1', 3, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('confirms a reschedule with the requested date and a set time', async () => {
    const { service, repo } = setup({
      ...scheduled(),
      rescheduleRequest: {
        preferredDate: '2099-02-01',
        preferredTime: 'morning',
        requestedAt: 'x',
      },
    });
    await service.updateByReference('TX-BK-000003', {
      confirmReschedule: true,
      scheduledTime: '09:00',
    });
    expect(repo.update).toHaveBeenCalledWith(3, {
      scheduledDate: '2099-02-01',
      scheduledTime: '09:00',
      rescheduleRequest: null,
    });
  });

  it('closes a booking when its cancellation is confirmed', async () => {
    const { service, repo } = setup({
      ...scheduled(),
      cancellationRequest: { reason: null, requestedAt: 'x' },
    });
    await service.updateByReference('TX-BK-000003', {
      confirmCancellation: true,
    });
    expect(repo.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        status: 'closed',
        closedAt: expect.any(Date),
        cancellationRequest: null,
      }),
    );
  });

  it('requires a date and time to schedule', async () => {
    const { service } = setup({
      ...scheduled(),
      status: 'requested',
      scheduledDate: null,
      scheduledTime: null,
    });
    await expect(
      service.updateByReference('TX-BK-000003', { status: 'scheduled' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
