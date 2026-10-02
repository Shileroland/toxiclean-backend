import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ROLES = ['customer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const USER_COUNTRIES = ['NG', 'BJ'] as const;
export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  /** Stored lower-cased. */
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  /** E.164, e.g. +2348034567890. */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  /** Null for accounts that only sign in with a third party. */
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 20, default: 'customer' })
  role: Role;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country: (typeof USER_COUNTRIES)[number] | null;

  @Column({ type: 'varchar', length: 5, default: 'en' })
  language: Language;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** The fields safe to return to clients. */
export type PublicUser = Pick<
  User,
  'id' | 'fullName' | 'email' | 'phone' | 'role' | 'country' | 'language'
>;

export function toPublicUser(user: User): PublicUser {
  const { id, fullName, email, phone, role, country, language } = user;
  return { id, fullName, email, phone, role, country, language };
}
