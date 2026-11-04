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
  /** False for the linked website account's own addresses, which only the customer can change. */
  editable: boolean;
};

export function formatCustomerReference(number: number) {
  return `TX-CU-${String(number).padStart(6, '0')}`;
}

const SEARCH_LIMIT = 10;

/** "%" and "_" are wildcards in ILIKE; match them literally. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

type Place = Omit<Location, 'id' | 'editable'>;

const sameAddress = (a: Place, b: Place) =>
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
    await this.assertEmailFree(dto.email);
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

  /** Changing the email re-links the customer to the website account with that email. */
  async update(id: string, dto: CustomerDto) {
    const customer = await this.get(id);
    if (dto.email !== customer.email) {
      await this.assertEmailFree(dto.email);
      customer.user = await this.users.findOne({ where: { email: dto.email } });
    }
    const { type, name, phone, email, country, preferredContactMethod } = dto;
    Object.assign(customer, {
      type,
      name,
      phone,
      email,
      country,
      preferredContactMethod,
    });
    return this.customers.save(customer);
  }

  private async assertEmailFree(email: string) {
    if (await this.customers.exists({ where: { email } })) {
      throw new ConflictException('A customer with this email already exists.');
    }
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
    const places = [
      ...own.map((place) => ({ place, editable: true })),
      ...fromAccount.map((place) => ({ place, editable: false })),
    ];
    for (const { place, editable } of places) {
      const { id, country, state, city, address } = place;
      const location = { id, country, state, city, address, editable };
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
    return { id, country, state, city, address, editable: true };
  }

  /** Edits one of the customer's own locations (not the website account's addresses). */
  async updateLocation(
    customerId: string,
    locationId: string,
    dto: LocationDto,
  ): Promise<Location> {
    const location = await this.locations.findOne({
      where: { id: locationId, customer: { id: customerId } },
    });
    if (!location) throw new NotFoundException('Location not found.');
    const others = (await this.listLocations(customerId)).filter(
      (l) => l.id !== locationId,
    );
    if (others.some((l) => sameAddress(l, dto))) {
      throw new ConflictException('This customer already has that location.');
    }
    Object.assign(location, {
      country: dto.country,
      state: dto.state,
      city: dto.city,
      address: dto.address,
    });
    const { id, country, state, city, address } =
      await this.locations.save(location);
    return { id, country, state, city, address, editable: true };
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
