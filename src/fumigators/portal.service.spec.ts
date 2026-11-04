import { BadRequestException, ConflictException } from '@nestjs/common';
import { PortalService } from './portal.service.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = Buffer.from('%PDF-1.4');
const photo = { buffer: PNG, originalname: 'a.png', size: PNG.length };
const form = { buffer: PDF, originalname: 'form.pdf', size: PDF.length };
const me = { id: 'f1', fullName: 'Daniel Okafor' } as never;

function setup(booking: object | null = {}) {
  const row = booking && {
    id: 7,
    status: 'in_progress',
    scheduledDate: '2026-01-01',
    photos: [],
    fumigators: [{ id: 'f1', fullName: 'Daniel Okafor' }],
    customer: null,
    treatmentRecord: null,
    ...booking,
  };
  const qb = {
    innerJoin: () => qb,
    leftJoinAndSelect: () => qb,
    where: () => qb,
    getOne: () => Promise.resolve(row),
  };
  const bookings = {
    createQueryBuilder: vi.fn(() => qb),
    findOneOrFail: vi.fn(() => Promise.resolve(row)),
    update: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
  const storage = { put: vi.fn(() => Promise.resolve('local')) };
  const service = new PortalService(bookings as never, storage as never);
  return { service, bookings, storage };
}

const record = {
  treatmentPerformed: 'Sprayed the kitchen.',
  noChemicals: true,
};
const files = { before: [photo], after: [photo], signOff: [form] };

describe('PortalService', () => {
  it('moves a job one step at a time', async () => {
    const { service, bookings } = setup({ status: 'scheduled' });
    await service.step(me, 7, 'en-route');
    expect(bookings.update).toHaveBeenCalledWith(7, { status: 'on_the_way' });
    await expect(service.step(me, 7, 'arrived')).rejects.toThrow(
      ConflictException,
    );
  });

  it('won’t start a job before its day', async () => {
    const { service } = setup({
      status: 'scheduled',
      scheduledDate: '2999-01-01',
    });
    await expect(service.step(me, 7, 'en-route')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('stores the treatment record and completes the job', async () => {
    const { service, bookings, storage } = setup();
    await service.complete(me, 7, record, files);
    expect(storage.put).toHaveBeenCalledTimes(3);
    expect(bookings.update).toHaveBeenCalledWith(
      { id: 7, status: 'in_progress' },
      expect.objectContaining({
        status: 'completed',
        treatmentRecord: expect.objectContaining({
          chemicals: [],
          submittedBy: { id: 'f1', fullName: 'Daniel Okafor' },
          signOff: expect.objectContaining({ mimeType: 'application/pdf' }),
        }),
      }),
    );
  });

  it('needs chemicals unless none were used', async () => {
    const { service, storage } = setup();
    await expect(
      service.complete(me, 7, { treatmentPerformed: 'x' }, files),
    ).rejects.toThrow('Add the chemicals used');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('needs before and after photos and a signed form', async () => {
    const { service } = setup();
    await expect(
      service.complete(me, 7, record, { ...files, before: [] }),
    ).rejects.toThrow('before and after');
    await expect(
      service.complete(me, 7, record, { ...files, signOff: [] }),
    ).rejects.toThrow('signed form');
  });

  it('stores nothing when one photo is bad', async () => {
    const { service, storage } = setup();
    const bad = { ...photo, buffer: Buffer.from('nope') };
    await expect(
      service.complete(me, 7, record, { ...files, after: [photo, bad] }),
    ).rejects.toThrow('PNG or JPG');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('only completes a job the fumigator has arrived at', async () => {
    const { service } = setup({ status: 'on_the_way' });
    await expect(service.complete(me, 7, record, files)).rejects.toThrow(
      ConflictException,
    );
  });
});
