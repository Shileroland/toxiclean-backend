import {
  Body,
  Controller,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service.js';
import {
  CurrentUser,
  SessionGuard,
  SessionToken,
} from '../auth/session.guard.js';
import {
  ChangePasswordDto,
  UpdateLanguageDto,
  UpdateProfileDto,
} from './dto/account.dto.js';
import { toPublicUser, User } from './user.entity.js';

/** The signed-in user's own account. Email changes need verification, so they aren't allowed here. */
@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
  ) {}

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.users.update(user.id, {
      fullName: dto.fullName,
      phone: dto.phone,
      country: dto.country ?? null,
    });
    return toPublicUser(await this.users.findOneByOrFail({ id: user.id }));
  }

  @Patch('language')
  async updateLanguage(
    @CurrentUser() user: User,
    @Body() dto: UpdateLanguageDto,
  ) {
    await this.users.update(user.id, { language: dto.language });
    return toPublicUser(await this.users.findOneByOrFail({ id: user.id }));
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: User,
    @SessionToken() token: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      token,
    );
  }
}
