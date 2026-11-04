import { AuthModule } from '../auth/auth.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { Module } from '@nestjs/common';
import { Product } from '../catalog/catalog.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteRequest } from './quote-request.entity.js';
import { QuoteRequestsController } from './quote-requests.controller.js';
import { QuoteRequestsService } from './quote-requests.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuoteRequest, Product]),
    AuthModule,
    LeadsModule,
  ],
  controllers: [QuoteRequestsController],
  providers: [QuoteRequestsService],
})
export class QuoteRequestsModule {}
