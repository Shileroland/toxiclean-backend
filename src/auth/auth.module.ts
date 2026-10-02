import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordResetToken } from './password-reset-token.entity.js';
import { Session } from './session.entity.js';
import { OptionalSessionGuard, SessionGuard } from './session.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, PasswordResetToken]),
    // Defaults; auth routes set their own limits with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, OptionalSessionGuard],
  exports: [AuthService, SessionGuard, OptionalSessionGuard],
})
export class AuthModule {}
