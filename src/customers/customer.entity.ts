import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

export const CUSTOMER_TYPES = ['individual', 'business'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/**
 * Someone the team does work for. Admins can add customers who never sign up; when a
 * website account has the same email, the two are linked.
 */
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, default: 'individual' })
  type: CustomerType;

  /** The person's full name, or the business name. */
  @Column({ type: 'varchar', length: 200 })
  name: string;

  /** E.164, e.g. +2348034567890. */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  /** Stored lower-cased; unique so website bookings can find their customer. */
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 2 })
  country: 'NG' | 'BJ';

  @Column({ type: 'varchar', length: 20 })
  preferredContactMethod: 'whatsapp' | 'phone' | 'email';

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @OneToMany(() => CustomerLocation, (location) => location.customer)
  locations: CustomerLocation[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** A service address saved for a customer. */
@Entity('customer_locations')
export class CustomerLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Customer, (customer) => customer.locations, {
    onDelete: 'CASCADE',
  })
  customer: Customer;

  @Column({ type: 'varchar', length: 2 })
  country: 'NG' | 'BJ';

  @Column({ type: 'varchar', length: 100 })
  state: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 300 })
  address: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
