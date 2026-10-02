import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteRequest } from './quote-request.entity.js';
import { QuoteRequestsController } from './quote-requests.controller.js';
import { QuoteRequestsService } from './quote-requests.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([QuoteRequest]), AuthModule],
  controllers: [QuoteRequestsController],
  providers: [QuoteRequestsService],
})
export class QuoteRequestsModule {}
