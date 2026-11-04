import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, Repository } from 'typeorm';
import {
  Booking,
  type BookingPhoto,
  type BookingStatus,
  type TreatmentFile,
  type TreatmentRecord,
} from '../bookings/booking.entity.js';
import { todayInWat } from '../bookings/bookings.service.js';
import {
  detectImageType,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  storeBookingPhotos,
} from '../bookings/photo-storage.js';
import { StorageService } from '../storage/storage.service.js';
import {
  detectDocumentType,
  DOCUMENT_EXTENSIONS,
} from './certificate-storage.js';
import type { Fumigator } from './fumigator.entity.js';
import type { CompleteBookingDto, PortalTab } from './portal.dto.js';

export const HISTORY_PAGE_SIZE = 10;

type Upload = { buffer: Buffer; originalname: string; size: number };

export type CompletionFiles = {
  before?: Upload[];
  after?: Upload[];
  signOff?: Upload[];
};

/** Files a fumigator can open on a job: the customer's photos and the treatment record's. */
export const FILE_KINDS = ['photos', 'before', 'after', 'signoff'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const ACTIVE: BookingStatus[] = ['scheduled', 'on_the_way', 'in_progress'];
const DONE: BookingStatus[] = ['completed', 'follow_up_required', 'closed'];

/** The field actions, each one step on from the last. */
const STEPS = {
  'en-route': { from: 'scheduled', to: 'on_the_way' },
  arrived: { from: 'on_the_way', to: 'in_progress' },
} as const satisfies Record<string, { from: BookingStatus; to: BookingStatus }>;
export type PortalStep = keyof typeof STEPS;

const fileInfo = ({ originalName, mimeType, size }: BookingPhoto) => ({
  originalName,
  mimeType,
  size,
});

/** A treatment record as clients see it: stored file names stay server-side. */
export function publicTreatmentRecord(record: TreatmentRecord | null) {
  if (!record) return null;
  return {
    ...record,
    beforePhotos: record.beforePhotos.map(fileInfo),
    afterPhotos: record.afterPhotos.map(fileInfo),
    signOff: fileInfo(record.signOff),
  };
}

/** Where a job's file lives in storage, or undefined if there's no such file. */
export function bookingFile(booking: Booking, kind: FileKind, index: number) {
  const record = booking.treatmentRecord;
  const file =
    kind === 'photos'
      ? booking.photos[index]
      : kind === 'before'
        ? record?.beforePhotos[index]
        : kind === 'after'
          ? record?.afterPhotos[index]
          : index === 0
            ? record?.signOff
            : undefined;
  if (!file) return undefined;
  const folder = kind === 'photos' ? 'bookings' : 'treatments';
  return { file, key: `${folder}/${file.fileName}` };
}

const summary = (b: Booking) => ({
  id: b.id,
  reference: b.reference,
  status: b.status,
  serviceName: b.serviceName,
  customer: b.customer?.name ?? b.fullName,
  address: [b.address, b.city, b.state].filter(Boolean).join(', '),
  scheduledDate: b.scheduledDate,
  scheduledTime: b.scheduledTime,
  endDate: b.endDate,
  endTime: b.endTime,
  completedAt: b.completedAt,
});

/** The field portal: a signed-in fumigator's own jobs. */
@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly storage: StorageService,
  ) {}

  private assigned(fumigator: Fumigator) {
    return this.bookings
      .createQueryBuilder('b')
      .innerJoin('b.fumigators', 'mine', 'mine.id = :me', { me: fumigator.id })
      .leftJoinAndSelect('b.customer', 'c');
  }

  /**
   * today: active jobs dated today or earlier (so overdue ones aren't lost), plus jobs
   * finished today; upcoming: scheduled from tomorrow; history: finished jobs, newest first.
   */
  async list(fumigator: Fumigator, tab: PortalTab, page = 1) {
    const today = todayInWat();
    const query = this.assigned(fumigator);
    if (tab === 'today') {
      query.where(
        new Brackets((w) =>
          w
            .where('b.status IN (:...active) AND b.scheduledDate <= :today', {
              active: ACTIVE,
            })
            .orWhere(
              "b.status IN (:...done) AND (b.completedAt AT TIME ZONE 'Africa/Lagos')::date = :today",
              { done: ['completed', 'follow_up_required'] },
            ),
        ),
        { today },
      );
      query.orderBy('b.scheduledDate', 'ASC').addOrderBy('b.scheduledTime');
    } else if (tab === 'upcoming') {
      query
        .where('b.status IN (:...active) AND b.scheduledDate > :today', {
          active: ACTIVE,
          today,
        })
        .orderBy('b.scheduledDate', 'ASC')
        .addOrderBy('b.scheduledTime');
    } else {
      query
        .where('b.status IN (:...done) AND b.scheduledDate IS NOT NULL', {
          done: DONE,
        })
        .orderBy('b.completedAt', 'DESC', 'NULLS LAST')
        .addOrderBy('b.scheduledDate', 'DESC')
        .skip((page - 1) * HISTORY_PAGE_SIZE)
        .take(HISTORY_PAGE_SIZE);
    }
    const [items, total] = await query.getManyAndCount();
    return {
      items: items.map(summary),
      total,
      page: tab === 'history' ? page : 1,
      pageSize: tab === 'history' ? HISTORY_PAGE_SIZE : total,
    };
  }

  /** One of the fumigator's jobs; anyone else's is "not found". */
  private async find(fumigator: Fumigator, id: number) {
    const found = await this.assigned(fumigator)
      .where('b.id = :id', { id })
      .getOne();
    if (!found) throw new NotFoundException('Booking not found.');
    // Reload with the whole team (the join above only matched this fumigator).
    return this.bookings.findOneOrFail({
      where: { id },
      relations: { fumigators: true, customer: true },
    });
  }

  async get(fumigator: Fumigator, id: number) {
    const b = await this.find(fumigator, id);
    return {
      ...summary(b),
      serviceCategory: b.serviceCategory,
      propertyType: b.propertyType,
      issue: b.issue,
      treatmentPlan: b.treatmentPlan,
      phone: b.customer?.phone ?? b.phone,
      city: b.city,
      state: b.state,
      team: b.fumigators.map((f) => ({ id: f.id, fullName: f.fullName })),
      photos: b.photos.map(fileInfo),
      treatmentRecord: publicTreatmentRecord(b.treatmentRecord),
    };
  }

  /** Mark En Route / Mark Arrived. */
  async step(fumigator: Fumigator, id: number, step: PortalStep) {
    const booking = await this.find(fumigator, id);
    const { from, to } = STEPS[step];
    if (booking.status !== from) {
      throw new ConflictException(
        `This job is ${booking.status.replace(/_/g, ' ')}; refresh to see the latest.`,
      );
    }
    if ((booking.scheduledDate ?? '') > todayInWat()) {
      throw new BadRequestException('This job isn’t due yet.');
    }
    await this.bookings.update(id, { status: to });
    return this.get(fumigator, id);
  }

  /** Complete Booking: saves the treatment record and marks the job completed. */
  async complete(
    fumigator: Fumigator,
    id: number,
    dto: CompleteBookingDto,
    files: CompletionFiles,
  ) {
    const booking = await this.find(fumigator, id);
    if (booking.status !== 'in_progress') {
      throw new ConflictException(
        'Mark the job as arrived before completing it.',
      );
    }
    const chemicals = dto.noChemicals ? [] : (dto.chemicals ?? []);
    if (!dto.noChemicals && chemicals.length === 0) {
      throw new BadRequestException(
        'Add the chemicals used, or choose “No chemicals used”.',
      );
    }
    const before = files.before ?? [];
    const after = files.after ?? [];
    const [signOff] = files.signOff ?? [];
    if (before.length === 0 || after.length === 0) {
      throw new BadRequestException(
        'Add at least one photo from before and after the treatment.',
      );
    }
    if (before.length > MAX_PHOTOS || after.length > MAX_PHOTOS) {
      throw new BadRequestException(
        `You can upload up to ${MAX_PHOTOS} photos for each.`,
      );
    }
    if (!signOff) {
      throw new BadRequestException('Upload the customer’s signed form.');
    }
    // Check every file before storing any, so a bad one leaves nothing behind.
    for (const photo of [...before, ...after]) {
      if (!detectImageType(photo.buffer)) {
        throw new BadRequestException('Photos must be PNG or JPG images.');
      }
      if (photo.size > MAX_PHOTO_BYTES) {
        throw new BadRequestException('Each photo must be 5MB or smaller.');
      }
    }
    const signOffType = detectDocumentType(signOff.buffer);
    if (!signOffType) {
      throw new BadRequestException(
        'The signed form must be a PDF, PNG or JPG file.',
      );
    }
    if (signOff.size > MAX_PHOTO_BYTES) {
      throw new BadRequestException('The signed form must be 5MB or smaller.');
    }

    const [beforePhotos, afterPhotos] = await Promise.all([
      storeBookingPhotos(before, this.storage, 'treatments'),
      storeBookingPhotos(after, this.storage, 'treatments'),
    ]);
    const signOffName = `${randomUUID()}.${DOCUMENT_EXTENSIONS[signOffType]}`;
    const signOffFile: TreatmentFile = {
      fileName: signOffName,
      storage: await this.storage.put(
        `treatments/${signOffName}`,
        signOff.buffer,
        signOffType,
      ),
      originalName: signOff.originalname.slice(0, 200),
      mimeType: signOffType,
      size: signOff.size,
    };

    const treatmentRecord: TreatmentRecord = {
      treatmentPerformed: dto.treatmentPerformed,
      chemicals: chemicals.map((c) => ({
        product: c.product,
        quantity: c.quantity,
        applicationMethod: c.applicationMethod,
        appliedBy: c.appliedBy,
      })),
      beforePhotos,
      afterPhotos,
      signOff: signOffFile,
      submittedBy: { id: fumigator.id, fullName: fumigator.fullName },
      submittedAt: new Date().toISOString(),
    };
    // Guarded on the status so two teammates submitting at once can't both win.
    const result = await this.bookings.update(
      { id, status: 'in_progress' },
      { status: 'completed', completedAt: new Date(), treatmentRecord },
    );
    if (!result.affected) {
      throw new ConflictException('This job was already completed.');
    }
    return this.get(fumigator, id);
  }

  async openFile(
    fumigator: Fumigator,
    id: number,
    kind: FileKind,
    index: number,
  ) {
    const found = bookingFile(await this.find(fumigator, id), kind, index);
    if (!found) throw new NotFoundException('File not found.');
    const stream = await this.storage
      .get(found.key, found.file.storage)
      .catch(() => {
        throw new NotFoundException('The file is missing.');
      });
    return { file: found.file, stream };
  }
}
