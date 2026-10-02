import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { toPublicUser, User } from '../users/user.entity.js';
import {
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './crypto.js';
import type { LoginDto, SignupDto } from './dto/auth.dto.js';
import { MailService } from '../mail/mail.service.js';
import { pagePrefix } from '../mail/templates.js';
import { PasswordResetToken } from './password-reset-token.entity.js';
import { Session } from './session.entity.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  // Compared against when an email isn't registered, so response time doesn't reveal it.
  private readonly dummyHash = hashPassword('dummy-password-for-timing');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }
    const user = await this.users.save(
      this.users.create({
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash: await hashPassword(dto.password),
      }),
    );
    return this.startSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    const valid = user?.passwordHash
      ? await verifyPassword(dto.password, user.passwordHash)
      : await verifyPassword(dto.password, await this.dummyHash).then(
          () => false,
        );

    if (!user || !valid) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    return this.startSession(user);
  }

  /** Returns the session's user, or null if the token is unknown or expired. */
  async getSessionUser(token: string) {
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(token), expiresAt: MoreThan(new Date()) },
    });
    return session?.user ?? null;
  }

  async logout(token: string) {
    await this.sessions.delete({ tokenHash: hashToken(token) });
  }

  /** Always succeeds, so the response never reveals whether an email is registered. */
  async requestPasswordReset(email: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user) return;

    // Only the most recent link should work.
    await this.resetTokens.delete({ user: { id: user.id }, usedAt: IsNull() });

    const token = generateToken();
    await this.resetTokens.save(
      this.resetTokens.create({
        tokenHash: hashToken(token),
        user,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        usedAt: null,
      }),
    );

    const base = this.config.get<string>('WEBAPP_URL', 'http://localhost:4000');
    await this.mail.sendPasswordReset(
      { email: user.email, name: user.fullName },
      `${base.replace(/\/$/, '')}${pagePrefix(user.language)}/reset-password?token=${token}`,
      user.language,
    );
  }

  async resetPassword(token: string, password: string) {
    const record = await this.resetTokens.findOne({
      where: {
        tokenHash: hashToken(token),
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
    });
    if (!record) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Please request a new one.',
      );
    }

    await this.users.update(record.user.id, {
      passwordHash: await hashPassword(password),
    });
    await this.resetTokens.update(record.id, { usedAt: new Date() });
    // Sign out everywhere: whoever knew the old password loses access.
    await this.sessions.delete({ user: { id: record.user.id } });
  }

  /** Changes the password after checking the current one; signs out every other session. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepToken: string,
  ) {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (
      !user?.passwordHash ||
      !(await verifyPassword(currentPassword, user.passwordHash))
    ) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    await this.users.update(user.id, {
      passwordHash: await hashPassword(newPassword),
    });
    await this.sessions.delete({
      user: { id: user.id },
      tokenHash: Not(hashToken(keepToken)),
    });
  }

  private async startSession(user: User) {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.sessions.save(
      this.sessions.create({ tokenHash: hashToken(token), user, expiresAt }),
    );
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: toPublicUser(user),
    };
  }
}
