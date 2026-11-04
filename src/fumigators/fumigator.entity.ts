import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import type { StorageDriver } from '../storage/storage.service.js';
import { User } from '../users/user.entity.js';

/** Branches per country; add new ones here. */
export const BRANCHES = {
  NG: ['Ikeja Branch'],
  BJ: ['Cotonou Branch'],
} as const;

export const SKILLS = [
  'Residential Fumigation',
  'Commercial Pest Control',
  'General Pest Control',
  'Commercial Fumigation',
  'Termite Treatment',
  'Rodent Control',
  'Mosquito Control',
  'Bed Bug Treatment',
  'Warehouse Fumigation',
  'Land Treatment',
  'Snake Control',
] as const;

export const WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** `unavailable`: on leave or otherwise off new bookings for now. */
export const AVAILABILITIES = ['available', 'unavailable'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

/** A technician who can be assigned to jobs; once invited, they sign in to the field portal. */
@Entity('fumigators')
export class Fumigator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  /** E.164, e.g. +2348034567890. */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 2 })
  country: 'NG' | 'BJ';

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  /** One of BRANCHES for the country. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  branch: string | null;

  /** Area they usually cover, e.g. Lagos Mainland. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  skills: string[];

  @Column({ type: 'varchar', length: 20, default: 'available' })
  availability: Availability;

  @Column({ type: 'jsonb', default: () => `'["mon","tue","wed","thu","fri"]'` })
  workingDays: Weekday[];

  /** HH:MM, 24-hour. */
  @Column({ type: 'varchar', length: 5, default: '08:00' })
  workStart: string;

  @Column({ type: 'varchar', length: 5, default: '17:00' })
  workEnd: string;

  @OneToMany(() => FumigatorCertificate, (c) => c.fumigator)
  certificates: Relation<FumigatorCertificate[]>;

  /** Their portal login (role `fumigator`), once invited. */
  @OneToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  user: Relation<User> | null;

  /** When the latest portal invite was sent. */
  @Column({ type: 'timestamptz', nullable: true })
  invitedAt: Date | null;

  /** Inactive fumigators keep their past jobs but can't be assigned new ones. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

export type CertificateDocument = {
  fileName: string;
  storage?: StorageDriver;
  originalName: string;
  mimeType: string;
  size: number;
};

/** A training or licence a fumigator holds, with its expiry. */
@Entity('fumigator_certificates')
export class FumigatorCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Fumigator, (f) => f.certificates, { onDelete: 'CASCADE' })
  fumigator: Relation<Fumigator>;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  issuingOrganisation: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  certificateNumber: string | null;

  @Column({ type: 'date' })
  issueDate: string;

  @Column({ type: 'date' })
  expiryDate: string;

  /** The uploaded certificate (PDF or image), if any. */
  @Column({ type: 'jsonb', nullable: true })
  document: CertificateDocument | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
