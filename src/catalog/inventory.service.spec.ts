import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';

/** A service whose transaction runs against in-memory stock and movement lists. */
function setup(
  stock = { id: 's1', onHand: 22, reserved: 4, reorderLevel: 10 },
  history: object[] = [],
) {
  const updates: object[] = [];
  const saved: object[] = [];
  const qb = {
    insert: () => qb,
    into: () => qb,
    values: () => qb,
    orIgnore: () => qb,
    execute: () => Promise.resolve(),
    setLock: () => qb,
    where: () => qb,
    getOneOrFail: () => Promise.resolve({ ...stock }),
  };
  const repo = {
    createQueryBuilder: () => qb,
    update: vi.fn((_id: unknown, change: object) => {
      updates.push(change);
      return Promise.resolve();
    }),
    create: (data: object) => data,
    save: vi.fn((data: object) => {
      saved.push(data);
      return Promise.resolve({
        id: 'm1',
        number: 8,
        date: '2026-11-04',
        ...data,
      });
    }),
    find: () => Promise.resolve(history),
  };
  const m = { createQueryBuilder: () => qb, getRepository: () => repo };
  const product = { id: 'p1', slug: 'solo-backpack-sprayer' };
  const products = {
    findOne: () => Promise.resolve(product),
    find: () => Promise.resolve([product]),
  };
  const levels = {
    manager: { transaction: (fn: (em: unknown) => unknown) => fn(m) },
  };
  const service = new InventoryService(
    products as never,
    levels as never,
    {} as never,
    {} as never,
    { emitReceived: vi.fn() } as never,
  );
  return { service, updates, saved, repo };
}

const user = { id: 'u1', fullName: 'Daniel Oyewole' } as never;

describe('InventoryService', () => {
  it('deducts with a reason and numbers the adjustment ADJ-YYYY-NNN', async () => {
    const { service, updates, repo } = setup();
    const r = await service.adjust(
      'p1',
      {
        country: 'NG',
        location: 'Ikeja Branch',
        direction: 'deduct',
        quantity: 5,
        reason: 'Damaged',
      },
      user,
    );
    expect(updates[0]).toEqual({ onHand: 17 });
    expect(r.reference).toBe('ADJ-2026-008');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'adjustment', quantity: -5 }),
    );
  });

  it('won’t deduct more than is on hand', async () => {
    const { service } = setup();
    await expect(
      service.adjust(
        'p1',
        {
          country: 'NG',
          location: 'Ikeja Branch',
          direction: 'deduct',
          quantity: 23,
          reason: 'x',
        },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('only uses the country’s branches', async () => {
    const { service } = setup();
    await expect(
      service.adjust(
        'p1',
        {
          country: 'NG',
          location: 'Cotonou Branch',
          direction: 'add',
          quantity: 1,
          reason: 'x',
        },
        user,
      ),
    ).rejects.toThrow('branches');
  });

  it('holds a confirmed request’s items once, then issues them on fulfilment', async () => {
    const request = {
      id: 3,
      reference: 'TX-PR-000003',
      country: 'NG',
      items: [
        {
          productSlug: 'solo-backpack-sprayer',
          productName: 'Solo',
          quantity: 2,
        },
      ],
    } as never;
    const first = setup();
    await first.service.reserveFor(request);
    expect(first.updates[0]).toEqual({ reserved: 6 });

    const held = {
      type: 'reserved',
      quantity: 2,
      location: 'Ikeja Branch',
      country: 'NG',
      reference: 'TX-PR-000003',
      product: { id: 'p1' },
    };
    const again = setup(undefined, [held]);
    await again.service.reserveFor(request);
    expect(again.updates).toEqual([]);

    const issue = setup(undefined, [held]);
    await issue.service.issueFor(request);
    expect(issue.updates[0]).toEqual({ onHand: 20, reserved: 2 });
  });
});
