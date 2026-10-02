import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const CONTACT_TOPICS = [
  'service',
  'product',
  'equipment',
  'bulk-quote',
  'office',
  'other',
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

@Entity('contact_messages')
export class ContactMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  /** E.164, e.g. +2348034567890. */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 2 })
  country: string;

  @Column({ type: 'varchar', length: 20 })
  topic: ContactTopic;

  @Column({ type: 'varchar', length: 20 })
  preferredContactMethod: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
