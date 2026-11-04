import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service.js';
import { Booking, type BookingStatus } from '../bookings/booking.entity.js';
import { todayInWat } from '../bookings/bookings.service.js';
import { StorageService } from '../storage/storage.service.js';
import { User } from '../users/user.entity.js';
import { storeCertificateDocument } from './certificate-storage.js';
import type {
  CertificateDto,
  FumigatorDto,
  UpdateFumigatorDto,
} from './fumigator.dto.js';
import {
  type Availability,
  BRANCHES,
  Fumigator,
  FumigatorCertificate,
} from './fumigator.entity.js';

export const PAGE_SIZE = 10;

/** Certificates expiring within this many days count as "expiring soon". */
export const EXPIRING_DAYS = 30;

export const CERTIFICATE_STATUSES = ['valid', 'expiring', 'expired'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export type FumigatorFilters = {
  country: 'NG' | 'BJ';
  q?: string;
  availability?: Availability[];
  certificate?: CertificateStatus[];
  page: number;
};

type Upload = { buffer: Buffer; originalname: string; size: number };

/** Jobs that are booked in but not yet done. */
const UPCOMING: BookingStatus[] = ['scheduled', 'on_the_way', 'in_progress'];
/** Jobs the fumigator has finished. */
const DONE: BookingStatus[] = ['completed', 'follow_up_required', 'closed'];

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function certificateStatus(
  expiryDate: string,
  today = todayInWat(),
): CertificateStatus {
  if (expiryDate < today) return 'expired';
  if (expiryDate <= addDays(today, EXPIRING_DAYS)) return 'expiring';
  return 'valid';
}

/** The worst status across a fumigator's certificates, or null with none. */
function overallStatus(certs: { expiryDate: string }[], today: string) {
  const statuses = certs.map((c) => certificateStatus(c.expiryDate, today));
  if (statuses.includes('expired')) return 'expired';
  if (statuses.includes('expiring')) return 'expiring';
  return statuses.length ? 'valid' : null;
}

const jobSummary = (b: Booking) => ({
  id: b.id,
  reference: b.reference,
  status: b.status,
  serviceName: b.serviceName,
  customer: b.customer?.name ?? b.fullName,
  scheduledDate: b.scheduledDate,
  scheduledTime: b.scheduledTime,
  endTime: b.endTime,
});

@Injectable()
export class FumigatorsService {
  constructor(
    @InjectRepository(Fumigator)
    private readonly fumigators: Repository<Fumigator>,
    @InjectRepository(FumigatorCertificate)
    private readonly certificates: Repository<FumigatorCertificate>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly storage: StorageService,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
  ) {}

  /** A country's fumigators, active ones first, then by name (for pickers). */
  list(country: 'NG' | 'BJ') {
    return this.fumigators.find({
      where: { country },
      order: { active: 'DESC', fullName: 'ASC' },
    });
  }

  /** The Fumigators page: search, filters, and each one's workload and certificates. */
  async page({
    country,
    q,
    availability,
    certificate,
    page,
  }: FumigatorFilters) {
    const today = todayInWat();
    const soon = addDays(today, EXPIRING_DAYS);
    const query = this.fumigators
      .createQueryBuilder('f')
      .where('f.country = :country', { country })
      .orderBy('f.active', 'DESC')
      .addOrderBy('f.fullName', 'ASC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query.andWhere(
        new Brackets((w) =>
          w
            .where('f.fullName ILIKE :like', { like })
            .orWhere('f.phone ILIKE :like', { like }),
        ),
      );
    }
    if (availability?.length) {
      query.andWhere('f.availability IN (:...availability)', { availability });
    }
    if (certificate?.length) {
      const has = (condition: string) =>
        `EXISTS (SELECT 1 FROM fumigator_certificates c WHERE c."fumigatorId" = f.id AND ${condition})`;
      const conditions = {
        expired: has('c."expiryDate" < :today'),
        expiring: `NOT ${has('c."expiryDate" < :today')} AND ${has('c."expiryDate" <= :soon')}`,
        valid: `${has('TRUE')} AND NOT ${has('c."expiryDate" <= :soon')}`,
      };
      query.andWhere(
        new Brackets((w) => {
          for (const status of certificate) {
            w.orWhere(conditions[status], { today, soon });
          }
        }),
      );
    }
    const [rows, total] = await query.getManyAndCount();
    const ids = rows.map((f) => f.id);
    const [upcoming, certs] = ids.length
      ? await Promise.all([
          this.bookings
            .createQueryBuilder('b')
            .innerJoin('b.fumigators', 'f')
            .select('f.id', 'id')
            .addSelect('COUNT(b.id)', 'count')
            .where('f.id IN (:...ids)', { ids })
            .andWhere('b.status IN (:...upcoming)', { upcoming: UPCOMING })
            .andWhere('b.scheduledDate >= :today', { today })
            .groupBy('f.id')
            .getRawMany<{ id: string; count: string }>(),
          this.certificates.find({
            where: { fumigator: { id: In(ids) } },
            relations: { fumigator: true },
          }),
        ])
      : [[], []];
    return {
      items: rows.map((f) => ({
        id: f.id,
        fullName: f.fullName,
        phone: f.phone,
        branch: f.branch,
        region: f.region,
        availability: f.availability,
        active: f.active,
        upcomingBookings: Number(
          upcoming.find((u) => u.id === f.id)?.count ?? 0,
        ),
        certificateStatus: overallStatus(
          certs.filter((c) => c.fumigator.id === f.id),
          today,
        ),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  private async find(id: string) {
    const fumigator = await this.fumigators.findOne({
      where: { id },
      relations: { certificates: true, user: true },
      order: { certificates: { expiryDate: 'ASC' } },
    });
    if (!fumigator) throw new NotFoundException('Fumigator not found.');
    return fumigator;
  }

  /** Profile, certificates, performance over the last `days`, workload and recent work. */
  async details(id: string, days = 30) {
    const f = await this.find(id);
    const today = todayInWat();
    const from = addDays(today, -days);
    const assigned = () =>
      this.bookings
        .createQueryBuilder('b')
        .innerJoin('b.fumigators', 'f', 'f.id = :id', { id })
        .leftJoinAndSelect('b.customer', 'c');
    const [period, upcoming, history] = await Promise.all([
      assigned()
        .where('b.scheduledDate BETWEEN :from AND :today', { from, today })
        .getMany(),
      assigned()
        .where('b.status IN (:...upcoming)', { upcoming: UPCOMING })
        .andWhere('b.scheduledDate >= :today', { today })
        .orderBy('b.scheduledDate', 'ASC')
        .addOrderBy('b.scheduledTime', 'ASC')
        .take(10)
        .getMany(),
      assigned()
        .where('b.status IN (:...done)', { done: DONE })
        .orderBy('b.completedAt', 'DESC', 'NULLS LAST')
        .addOrderBy('b.scheduledDate', 'DESC')
        .take(5)
        .getMany(),
    ]);
    const completed = period.filter((b) => DONE.includes(b.status)).length;
    // Jobs whose date has come: done, or should have been.
    const due = period.filter(
      (b) => DONE.includes(b.status) || (b.scheduledDate ?? today) < today,
    ).length;
    const { certificates, user, ...profile } = f;
    return {
      ...profile,
      portal: await this.portalAccess(user, f.invitedAt),
      certificates: certificates.map((c) => ({
        id: c.id,
        name: c.name,
        issuingOrganisation: c.issuingOrganisation,
        certificateNumber: c.certificateNumber,
        issueDate: c.issueDate,
        expiryDate: c.expiryDate,
        status: certificateStatus(c.expiryDate, today),
        document: c.document && { originalName: c.document.originalName },
      })),
      certificateStatus: overallStatus(certificates, today),
      performance: {
        days,
        completedBookings: completed,
        completionRate: due ? Math.round((completed / due) * 100) : null,
        followUpsRequired: period.filter(
          (b) => b.status === 'follow_up_required',
        ).length,
      },
      upcomingBookings: upcoming.map(jobSummary),
      recentWork: history.map(jobSummary),
    };
  }

  /** not_invited, invited (no password set yet) or active, with the login email. */
  private async portalAccess(user: User | null, invitedAt: Date | null) {
    if (!user)
      return { status: 'not_invited' as const, email: null, invitedAt };
    const hasPassword = await this.users
      .createQueryBuilder('u')
      .where('u.id = :id AND u.passwordHash IS NOT NULL', { id: user.id })
      .getExists();
    return {
      status: hasPassword ? ('active' as const) : ('invited' as const),
      email: user.email,
      invitedAt,
    };
  }

  /**
   * Gives the fumigator a portal login (or re-sends it) and emails a set-password link.
   * The login uses the profile's email; an email already used by a customer or staff
   * account can't be reused.
   */
  async invite(id: string) {
    const f = await this.find(id);
    if (!f.active) {
      throw new BadRequestException('Reactivate this fumigator first.');
    }
    if (!f.email) {
      throw new BadRequestException(
        'Add an email address to the profile before sending an invite.',
      );
    }
    const email = f.email.toLowerCase();
    const owner = await this.users.findOne({ where: { email } });
    if (owner && owner.id !== f.user?.id) {
      const linked = await this.fumigators.exists({
        where: { user: { id: owner.id } },
      });
      if (owner.role !== 'fumigator' || linked) {
        throw new ConflictException(
          'This email is already used by another account. Use a different email.',
        );
      }
    }
    let user = owner ?? f.user;
    if (user) {
      // Keep the login in step with the profile.
      user.fullName = f.fullName;
      user.phone = f.phone;
      user.email = email;
      user.country = f.country;
      user = await this.users.save(user);
    } else {
      user = await this.users.save(
        this.users.create({
          fullName: f.fullName,
          email,
          phone: f.phone,
          role: 'fumigator',
          country: f.country,
          language: f.country === 'BJ' ? 'fr' : 'en',
          passwordHash: null,
        }),
      );
    }
    await this.fumigators.update(id, { user, invitedAt: new Date() });
    await this.auth.requestPasswordReset(email, true);
    return this.details(id);
  }

  /** Branch must be one of the country's; working hours must end after they start. */
  private check(
    country: 'NG' | 'BJ',
    dto: { branch?: string | null; workStart?: string; workEnd?: string },
    current?: Fumigator,
  ) {
    if (
      dto.branch &&
      !(BRANCHES[country] as readonly string[]).includes(dto.branch)
    ) {
      throw new BadRequestException('Choose one of the country’s branches.');
    }
    const start = dto.workStart ?? current?.workStart ?? '08:00';
    const end = dto.workEnd ?? current?.workEnd ?? '17:00';
    if (end <= start) {
      throw new BadRequestException('Working hours must end after they start.');
    }
  }

  create(dto: FumigatorDto) {
    this.check(dto.country, dto);
    return this.fumigators.save(
      this.fumigators.create({
        fullName: dto.fullName,
        phone: dto.phone,
        country: dto.country,
        email: dto.email || null,
        branch: dto.branch || null,
        region: dto.region || null,
        skills: dto.skills ?? [],
        availability: dto.availability ?? 'available',
        ...(dto.workingDays && { workingDays: dto.workingDays }),
        ...(dto.workStart && { workStart: dto.workStart }),
        ...(dto.workEnd && { workEnd: dto.workEnd }),
      }),
    );
  }

  async update(id: string, dto: UpdateFumigatorDto) {
    const fumigator = await this.fumigators.findOne({ where: { id } });
    if (!fumigator) throw new NotFoundException('Fumigator not found.');
    const country = dto.country ?? fumigator.country;
    // Moving country drops a branch that only exists in the old one.
    const branch =
      dto.branch !== undefined
        ? dto.branch || null
        : dto.country && dto.country !== fumigator.country
          ? null
          : fumigator.branch;
    this.check(
      country,
      { branch, workStart: dto.workStart, workEnd: dto.workEnd },
      fumigator,
    );
    // Only fields that were sent change.
    const set = <K extends keyof Fumigator>(
      key: K,
      value: Fumigator[K] | undefined,
    ) => {
      if (value !== undefined) fumigator[key] = value;
    };
    set('fullName', dto.fullName);
    set('phone', dto.phone);
    set('country', dto.country);
    set('active', dto.active);
    set('skills', dto.skills);
    set('availability', dto.availability);
    set('workingDays', dto.workingDays);
    set('workStart', dto.workStart);
    set('workEnd', dto.workEnd);
    fumigator.branch = branch;
    if (dto.email !== undefined) fumigator.email = dto.email || null;
    if (dto.region !== undefined) fumigator.region = dto.region || null;
    return this.fumigators.save(fumigator);
  }

  async setAvailability(id: string, availability: Availability) {
    const fumigator = await this.fumigators.findOne({ where: { id } });
    if (!fumigator) throw new NotFoundException('Fumigator not found.');
    await this.fumigators.update(id, { availability });
    return this.details(id);
  }

  async addCertificate(id: string, dto: CertificateDto, file?: Upload) {
    await this.find(id);
    if (dto.expiryDate <= dto.issueDate) {
      throw new BadRequestException(
        'The expiry date must be after the issue date.',
      );
    }
    const document = file
      ? await storeCertificateDocument(file, this.storage)
      : null;
    await this.certificates.save(
      this.certificates.create({
        fumigator: { id },
        name: dto.name,
        issuingOrganisation: dto.issuingOrganisation,
        certificateNumber: dto.certificateNumber || null,
        issueDate: dto.issueDate,
        expiryDate: dto.expiryDate,
        document,
      }),
    );
    return this.details(id);
  }

  private async certificate(id: string, certificateId: string) {
    const cert = await this.certificates.findOne({
      where: { id: certificateId, fumigator: { id } },
    });
    if (!cert) throw new NotFoundException('Certificate not found.');
    return cert;
  }

  /** Edits a certificate; a new document replaces the old one. */
  async updateCertificate(
    id: string,
    certificateId: string,
    dto: CertificateDto,
    file?: Upload,
  ) {
    const cert = await this.certificate(id, certificateId);
    if (dto.expiryDate <= dto.issueDate) {
      throw new BadRequestException(
        'The expiry date must be after the issue date.',
      );
    }
    const previous = cert.document;
    const document = file
      ? await storeCertificateDocument(file, this.storage)
      : previous;
    await this.certificates.update(cert.id, {
      name: dto.name,
      issuingOrganisation: dto.issuingOrganisation,
      certificateNumber: dto.certificateNumber || null,
      issueDate: dto.issueDate,
      expiryDate: dto.expiryDate,
      document,
    });
    if (file && previous) {
      await this.storage
        .delete(`certificates/${previous.fileName}`, previous.storage)
        .catch(() => {});
    }
    return this.details(id);
  }

  async removeCertificate(id: string, certificateId: string) {
    const cert = await this.certificate(id, certificateId);
    await this.certificates.delete(cert.id);
    if (cert.document) {
      await this.storage
        .delete(`certificates/${cert.document.fileName}`, cert.document.storage)
        .catch(() => {});
    }
    return this.details(id);
  }

  async openDocument(id: string, certificateId: string) {
    const cert = await this.certificate(id, certificateId);
    if (!cert.document) throw new NotFoundException('No document uploaded.');
    const stream = await this.storage
      .get(`certificates/${cert.document.fileName}`, cert.document.storage)
      .catch(() => {
        throw new NotFoundException('Document file is missing.');
      });
    return { document: cert.document, stream };
  }

  /** Active fumigators for an assignment; rejects unknown, inactive or other-country ones. */
  async forAssignment(ids: string[], country: string) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.fumigators.find({
      where: { id: In(unique), active: true, country: country as 'NG' | 'BJ' },
      order: { fullName: 'ASC' },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Choose active fumigators from the job’s country.',
      );
    }
    return found;
  }
}
