import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './lead.entity.js';
import { LeadsService } from './leads.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Lead])],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
