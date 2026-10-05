import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** A technician who can be assigned to jobs. Fumigators don't sign in. */
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

  /** Inactive fumigators keep their past jobs but can't be assigned new ones. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
