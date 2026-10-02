import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AccountController } from './account.controller.js';
import { User } from './user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [AccountController],
})
export class UsersModule {}
