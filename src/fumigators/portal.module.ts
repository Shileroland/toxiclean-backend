import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { Booking } from '../bookings/booking.entity.js';
import { Fumigator } from './fumigator.entity.js';
import { FumigatorGuard } from './fumigator.guard.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

/** The fumigator field portal (`/api/fumigator/...`). */
@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Fumigator]),
    AuthModule,
    CatalogModule,
  ],
  controllers: [PortalController],
  providers: [PortalService, FumigatorGuard],
})
export class PortalModule {}
