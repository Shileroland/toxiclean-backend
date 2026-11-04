import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { Booking } from './booking.entity.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), AuthModule, LeadsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
