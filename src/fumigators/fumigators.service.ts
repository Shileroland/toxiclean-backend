import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { FumigatorDto, UpdateFumigatorDto } from './fumigator.dto.js';
import { Fumigator } from './fumigator.entity.js';

@Injectable()
export class FumigatorsService {
  constructor(
    @InjectRepository(Fumigator)
    private readonly fumigators: Repository<Fumigator>,
  ) {}

  /** A country's fumigators, active ones first, then by name. */
  list(country: 'NG' | 'BJ') {
    return this.fumigators.find({
      where: { country },
      order: { active: 'DESC', fullName: 'ASC' },
    });
  }

  create(dto: FumigatorDto) {
    return this.fumigators.save(
      this.fumigators.create({
        fullName: dto.fullName,
        phone: dto.phone,
        country: dto.country,
      }),
    );
  }

  async update(id: string, dto: UpdateFumigatorDto) {
    const fumigator = await this.fumigators.findOne({ where: { id } });
    if (!fumigator) throw new NotFoundException('Fumigator not found.');
    Object.assign(fumigator, dto);
    return this.fumigators.save(fumigator);
  }

  /** Active fumigators for an assignment; rejects unknown, inactive or other-country ones. */
  async forAssignment(ids: string[], country: string) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.fumigators.find({
      where: { id: In(unique), active: true, country: country as 'NG' | 'BJ' },
      order: { fullName: 'ASC' },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Choose active fumigators from the job’s country.',
      );
    }
    return found;
  }
}
