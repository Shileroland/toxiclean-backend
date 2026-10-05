import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Address } from '../addresses/address.entity.js';
import type { Booking } from '../bookings/booking.entity.js';
import { User } from '../users/user.entity.js';
import type { CustomerDto, LocationDto } from './customer.dto.js';
import { Customer, CustomerLocation } from './customer.entity.js';

export type Location = {
  id: string;
  country: 'NG' | 'BJ';
  state: string;
  city: string;
  address: string;
};

const SEARCH_LIMIT = 10;

/** "%" and "_" are wildcards in ILIKE; match them literally. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

const sameAddress = (a: Omit<Location, 'id'>, b: Omit<Location, 'id'>) =>
  [a.address, a.city, a.state].join('|').toLowerCase() ===
  [b.address, b.city, b.state].join('|').toLowerCase();

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(CustomerLocation)
    private readonly locations: Repository<CustomerLocation>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
  ) {}

  /** Customers in a country whose name, phone or email contains `query`. */
  search(country: 'NG' | 'BJ', query = '') {
    const like = ILike(`%${escapeLike(query.trim())}%`);
    return this.customers.find({
      where: [
        { country, name: like },
        { country, email: like },
        { country, phone: like },
      ],
      order: { name: 'ASC' },
      take: SEARCH_LIMIT,
    });
  }

  async get(id: string) {
    const customer = await this.customers.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!customer) throw new NotFoundException('Customer not found.');
    return customer;
  }

  async create(dto: CustomerDto) {
    if (await this.customers.exists({ where: { email: dto.email } })) {
      throw new ConflictException('A customer with this email already exists.');
    }
    const user = await this.users.findOne({ where: { email: dto.email } });
    const { type, name, phone, email, country, preferredContactMethod } = dto;
    return this.customers.save(
      this.customers.create({
        type,
        name,
        phone,
        email,
        country,
        preferredContactMethod,
        user,
      }),
    );
  }

  /**
   * Saved locations: the customer's own, plus the linked website account's saved
   * addresses (those can't be edited here). Duplicates are listed once.
   */
  async listLocations(customerId: string): Promise<Location[]> {
    const customer = await this.get(customerId);
    const own = await this.locations.find({
      where: { customer: { id: customerId } },
      order: { createdAt: 'ASC' },
    });
    const fromAccount = customer.user
      ? await this.addresses.find({
          where: { user: { id: customer.user.id } },
          order: { createdAt: 'ASC' },
        })
      : [];
    const all: Location[] = [];
    for (const { id, country, state, city, address } of [
      ...own,
      ...fromAccount,
    ]) {
      const location = { id, country, state, city, address };
      if (!all.some((l) => sameAddress(l, location))) all.push(location);
    }
    return all;
  }

  async addLocation(customerId: string, dto: LocationDto): Promise<Location> {
    const customer = await this.get(customerId);
    const existing = (await this.listLocations(customerId)).find((l) =>
      sameAddress(l, dto),
    );
    if (existing) return existing;
    const { id, country, state, city, address } = await this.locations.save(
      this.locations.create({
        country: dto.country,
        state: dto.state,
        city: dto.city,
        address: dto.address,
        customer,
      }),
    );
    return { id, country, state, city, address };
  }

  /** A saved location by id, from the customer's own or their account's addresses. */
  async location(customerId: string, locationId: string) {
    const found = (await this.listLocations(customerId)).find(
      (l) => l.id === locationId,
    );
    if (!found) throw new NotFoundException('Location not found.');
    return found;
  }

  /**
   * The customer for a website booking, matched by email (created if new), with the
   * booking's address saved to their locations.
   */
  async forBooking(booking: Booking) {
    const email = booking.email.toLowerCase();
    let customer = await this.customers.findOne({ where: { email } });
    if (!customer) {
      customer = await this.customers.save(
        this.customers.create({
          type: 'individual',
          name: booking.fullName,
          phone: booking.phone,
          email,
          country: booking.country as 'NG' | 'BJ',
          preferredContactMethod:
            booking.preferredContactMethod as Customer['preferredContactMethod'],
          user:
            booking.user ?? (await this.users.findOne({ where: { email } })),
        }),
      );
    }
    await this.addLocation(customer.id, {
      country: booking.country as 'NG' | 'BJ',
      state: booking.state,
      city: booking.city,
      address: booking.address,
    });
    return customer;
  }
}
