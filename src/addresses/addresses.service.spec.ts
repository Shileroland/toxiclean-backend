import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AddressesService } from './addresses.service.js';

const dto = {
  country: 'NG' as const,
  state: 'Lagos',
  city: 'Ikeja',
  address: '21 Market Road',
};

function setup() {
  const repo = {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn((d: object) => d),
    save: vi.fn((d: object) =>
      Promise.resolve({ id: 'a1', createdAt: new Date(), ...d }),
    ),
    remove: vi.fn(),
  };
  return { repo, service: new AddressesService(repo as never) };
}

describe('AddressesService', () => {
  it('only looks up addresses owned by the user', async () => {
    const { repo, service } = setup();
    repo.findOne.mockResolvedValue(null);
    await expect(service.update('user-b', 'a1', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('user-b', 'a1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'a1', user: { id: 'user-b' } },
    });
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('creates addresses for the signed-in user without leaking the user', async () => {
    const { repo, service } = setup();
    repo.count.mockResolvedValue(0);
    const created = await service.create('user-a', dto);
    expect(repo.create).toHaveBeenCalledWith({
      ...dto,
      user: { id: 'user-a' },
    });
    expect(created).not.toHaveProperty('user');
  });

  it('caps the number of saved addresses', async () => {
    const { repo, service } = setup();
    repo.count.mockResolvedValue(20);
    await expect(service.create('user-a', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
