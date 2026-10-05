import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';
import { hashPassword, PASSWORD_RULE } from './crypto.js';

/**
 * Makes sure the owner account exists. On startup, if there's no super admin yet,
 * SUPER_ADMIN_EMAIL becomes one: an existing account is promoted (password untouched);
 * otherwise it's created with SUPER_ADMIN_PASSWORD, or, without one, emailed a link
 * to set a password. Once a super admin exists this does nothing, so changing the
 * env values later never resets anything.
 */
@Injectable()
export class SuperAdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminSeeder.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config
      .get<string>('SUPER_ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
    if (!email) return;
    if (await this.users.exists({ where: { role: 'super_admin' } })) return;

    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      await this.users.update(existing.id, { role: 'super_admin' });
      this.logger.log(`Promoted ${email} to super admin`);
      return;
    }

    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD') || null;
    if (password && !PASSWORD_RULE.test(password)) {
      this.logger.error(
        'SUPER_ADMIN_PASSWORD needs at least 8 characters, an uppercase letter and a number; super admin not created',
      );
      return;
    }

    await this.users.save(
      this.users.create({
        email,
        fullName: email.split('@')[0],
        phone: '',
        passwordHash: password ? await hashPassword(password) : null,
        role: 'super_admin',
      }),
    );
    if (password) {
      this.logger.log(`Created super admin ${email}`);
    } else {
      await this.auth.requestPasswordReset(email);
      this.logger.log(
        `Created super admin ${email}; emailed a link to set the password`,
      );
    }
  }
}
