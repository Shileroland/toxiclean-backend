import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Testimonial } from './testimonial.entity.js';
import {
  AdminTestimonialsController,
  PublicTestimonialsController,
} from './testimonials.controller.js';
import { TestimonialsService } from './testimonials.service.js';

/** Customer testimonials: managed in the admin, shown on the website. */
@Module({
  imports: [TypeOrmModule.forFeature([Testimonial]), AuthModule],
  controllers: [AdminTestimonialsController, PublicTestimonialsController],
  providers: [TestimonialsService],
})
export class TestimonialsModule {}
