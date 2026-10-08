import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../addresses/address.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { Booking } from '../bookings/booking.entity.js';
import { Customer, CustomerLocation } from '../customers/customer.entity.js';
import { CustomersService } from '../customers/customers.service.js';
import { Fumigator } from '../fumigators/fumigator.entity.js';
import { FumigatorsService } from '../fumigators/fumigators.service.js';
import {
  PurchaseRequestContact,
  PurchaseRequestNote,
  PurchaseRequestPayment,
} from '../quote-requests/purchase-request-activity.entity.js';
import { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import { User } from '../users/user.entity.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import {
  AdminCustomersController,
  AdminFumigatorsController,
} from './admin-people.controller.js';
import { AdminPurchaseRequestsController } from './admin-purchase-requests.controller.js';
import { AdminPurchaseRequestsService } from './admin-purchase-requests.service.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      QuoteRequest,
      PurchaseRequestPayment,
      PurchaseRequestContact,
      PurchaseRequestNote,
      Customer,
      CustomerLocation,
      Fumigator,
      User,
      Address,
    ]),
    AuthModule,
  ],
  controllers: [
    AdminController,
    AdminBookingsController,
    AdminPurchaseRequestsController,
    AdminCustomersController,
    AdminFumigatorsController,
  ],
  providers: [
    AdminService,
    AdminBookingsService,
    AdminPurchaseRequestsService,
    CustomersService,
    FumigatorsService,
  ],
})
export class AdminModule {}
