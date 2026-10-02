import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { StorageDriver } from '../storage/storage.service.js';
import { User } from '../users/user.entity.js';

export const DOCUMENT_TYPES = [
  'certificate',
  'record',
  'invoice',
  'receipt',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Treatment certificates, invoices etc. issued to a customer by the team. */
@Entity('documents')
export class CustomerDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  type: DocumentType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** The booking or request it belongs to, e.g. TX-BK-000123. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  reference: string | null;

  @Column({ type: 'date' })
  issuedOn: string;

  /** Stored at `documents/<fileName>`. Never returned to clients. */
  @Column({ type: 'varchar', length: 100 })
  fileName: string;

  @Column({ type: 'varchar', length: 10, default: 'local' })
  storage: StorageDriver;

  @Column({ type: 'varchar', length: 50 })
  mimeType: string;

  @Column({ type: 'int' })
  size: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
