import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AddressDto } from './address.dto.js';
import { Address } from './address.entity.js';

const MAX_ADDRESSES = 20;

const toResponse = ({
  id,
  country,
  state,
  city,
  address,
  createdAt,
}: Address) => ({
  id,
  country,
  state,
  city,
  address,
  createdAt,
});

/** Every query is scoped to the owner, so users can never see or change others' addresses. */
@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
  ) {}

  async list(userId: string) {
    const rows = await this.addresses.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toResponse);
  }

  async create(userId: string, dto: AddressDto) {
    if (
      (await this.addresses.count({ where: { user: { id: userId } } })) >=
      MAX_ADDRESSES
    ) {
      throw new BadRequestException(
        `You can save up to ${MAX_ADDRESSES} addresses.`,
      );
    }
    const saved = await this.addresses.save(
      this.addresses.create({
        country: dto.country,
        state: dto.state,
        city: dto.city,
        address: dto.address,
        user: { id: userId },
      }),
    );
    return toResponse(saved);
  }

  async update(userId: string, id: string, dto: AddressDto) {
    const address = await this.findOwned(userId, id);
    Object.assign(address, {
      country: dto.country,
      state: dto.state,
      city: dto.city,
      address: dto.address,
    });
    return toResponse(await this.addresses.save(address));
  }

  async remove(userId: string, id: string) {
    await this.addresses.remove(await this.findOwned(userId, id));
  }

  private async findOwned(userId: string, id: string) {
    const address = await this.addresses.findOne({
      where: { id, user: { id: userId } },
    });
    if (!address) throw new NotFoundException('Address not found.');
    return address;
  }
}
