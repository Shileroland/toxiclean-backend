import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { StoredFile } from '../catalog/catalog.entity.js';

/** The website's "Who we serve" groups; the site shows each page the matching quotes. */
export const TESTIMONIAL_SEGMENTS = [
  'agriculture',
  'pest_control',
  'institutional',
] as const;
export type TestimonialSegment = (typeof TESTIMONIAL_SEGMENTS)[number];

/** A customer quote shown on the public website. */
@Entity('testimonials')
export class Testimonial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** As the customer agreed to be named, e.g. "Biodun Ige" or "Biodun I.". */
  @Column({ type: 'varchar', length: 100 })
  authorName: string;

  /** Job title and/or company, e.g. "Facilities Officer, Lagoon Hospital". */
  @Column({ type: 'varchar', length: 150, default: '' })
  authorRole: string;

  /** The role on the French site; the English one when null. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  authorRoleFr: string | null;

  /** City or state, e.g. "Lagos". */
  @Column({ type: 'varchar', length: 100, default: '' })
  location: string;

  @Column({ type: 'varchar', length: 20 })
  segment: TestimonialSegment;

  @Column({ type: 'text' })
  quote: string;

  /** The quote on the French site; the English one when empty. */
  @Column({ type: 'text', default: '' })
  quoteFr: string;

  /** The customer's photo or company logo, stored under `testimonials/`. */
  @Column({ type: 'jsonb', nullable: true })
  photo: StoredFile | null;

  /** Shown on the website. New testimonials start hidden until reviewed. */
  @Column({ type: 'boolean', default: false })
  published: boolean;

  /** Display order, lowest first. */
  @Index()
  @Column({ type: 'integer', default: 0 })
  position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
