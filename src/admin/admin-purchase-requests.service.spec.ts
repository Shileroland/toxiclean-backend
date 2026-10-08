import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminPurchaseRequestsService } from './admin-purchase-requests.service.js';

type Row = Record<string, unknown> & { id: number; status: string };

function setup(row: Row | null, accounts?: string) {
  let current = row;
  const requests = {
    findOne: vi.fn(() =>
      Promise.resolve(
        current && {
          payments: [],
          contacts: [],
          internalNotes: [],
          user: null,
          ...current,
        },
      ),
    ),
    update: vi.fn((_id: number, patch: object) => {
      current = { ...current!, ...patch };
      return Promise.resolve();
    }),
  };
  const repo = () => ({
    create: vi.fn((d: object) => d),
    save: vi.fn((d: object) => Promise.resolve(d)),
  });
  const payments = repo();
  const contacts = repo();
  const notes = repo();
  const config = { get: vi.fn(() => accounts) };
  const service = new AdminPurchaseRequestsService(
    requests as never,
    payments as never,
    contacts as never,
    notes as never,
    config as never,
  );
  return {
    service,
    requests,
    payments,
    contacts,
    notes,
    state: () => current!,
  };
}

const base = {
  id: 7,
  kind: 'product',
  deliveryMethod: 'delivery',
  confirmedTotal: null,
  items: [
    {
      productSlug: 'a',
      productName: 'Sprayer',
      quantity: 2,
      unitPrice: 120_000,
    },
    { productSlug: 'b', productName: 'Nozzle', quantity: 2, unitPrice: 45_000 },
  ],
};
const user = { id: 'u1', fullName: 'Daniel Oyewole' } as never;

describe('AdminPurchaseRequestsService', () => {
  it('reports a missing request as not found', async () => {
    await expect(setup(null).service.get(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('works out the estimated total, balance and source', async () => {
    const { service } = setup({
      ...base,
      status: 'payment_pending',
      confirmedTotal: 330_000,
      payments: [{ id: 'p', amount: 150_000, recordedBy: null }],
    });
    const r = await service.get(7);
    expect(r).toMatchObject({
      estimatedTotal: 330_000,
      amountPaid: 150_000,
      balanceDue: 180_000,
      source: 'direct_request',
    });
  });

  it('moves a new request to Contacted when the first contact is logged', async () => {
    const { service, contacts, state } = setup({
      ...base,
      status: 'requested',
    });
    await service.logContact(
      7,
      { method: 'phone', date: '2026-09-24', time: '12:00', note: 'Called' },
      user,
    );
    expect(contacts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contactedAt: new Date('2026-09-24T11:00:00Z'),
        loggedBy: { id: 'u1' },
      }),
    );
    expect(state().status).toBe('contacted');
  });

  it('confirms with the agreed prices and total', async () => {
    const { service, state } = setup({ ...base, status: 'contacted' });
    await service.confirm(7, [110_000, 40_000]);
    expect(state()).toMatchObject({
      status: 'confirmed',
      confirmedTotal: 300_000,
    });
    expect(
      (state().items as { agreedUnitPrice: number }[]).map(
        (i) => i.agreedUnitPrice,
      ),
    ).toEqual([110_000, 40_000]);
  });

  it('needs a price for every item, and only confirms new or contacted requests', async () => {
    await expect(
      setup({ ...base, status: 'contacted' }).service.confirm(7, [1]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({ ...base, status: 'processing' }).service.confirm(7, [1, 2]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('declines with a reason, but not once a payment exists', async () => {
    const ok = setup({ ...base, status: 'contacted' });
    await ok.service.decline(7, 'Out of stock');
    expect(ok.state()).toMatchObject({
      status: 'declined',
      declineReason: 'Out of stock',
    });
    await expect(
      setup({
        ...base,
        status: 'payment_pending',
        payments: [{ amount: 1 }],
      }).service.decline(7, 'x'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps partial payments pending and marks full payment received', async () => {
    const { service, payments, state } = setup({
      ...base,
      status: 'payment_pending',
      confirmedTotal: 330_000,
    });
    const pay = {
      method: 'bank_transfer' as const,
      paidOn: '2026-10-20',
      account: 'GTBank, Nigeria',
    };
    await service.recordPayment(7, { amount: 150_000, ...pay }, user);
    expect(state().status).toBe('payment_pending');
    expect(payments.save).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 150_000, recordedBy: { id: 'u1' } }),
    );
  });

  it('marks the request paid when the balance is cleared, and refuses overpayment', async () => {
    const paid = setup({
      ...base,
      status: 'payment_pending',
      confirmedTotal: 330_000,
      payments: [{ amount: 150_000 }],
    });
    const pay = {
      method: 'cash' as const,
      paidOn: '2026-10-22',
      account: 'Office',
    };
    await expect(
      paid.service.recordPayment(7, { amount: 200_000, ...pay }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await paid.service.recordPayment(7, { amount: 180_000, ...pay }, user);
    expect(paid.state().status).toBe('payment_received');
  });

  it('dispatches deliveries and readies pickups, then completes', async () => {
    const delivery = setup({ ...base, status: 'processing' });
    await delivery.service.fulfil(7);
    expect(delivery.state().status).toBe('dispatched');
    const pickup = setup({
      ...base,
      deliveryMethod: 'pickup',
      status: 'processing',
    });
    await pickup.service.fulfil(7);
    expect(pickup.state().status).toBe('ready_for_pickup');
    await pickup.service.complete(7);
    expect(pickup.state().status).toBe('completed');
  });

  it('follows the order of steps', async () => {
    await expect(
      setup({ ...base, status: 'confirmed' }).service.startProcessing(7),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup({ ...base, status: 'payment_received' }).service.complete(7),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores internal notes with the author', async () => {
    const { service, notes } = setup({ ...base, status: 'requested' });
    await service.addNote(7, 'Deliver after 2pm', user);
    expect(notes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Deliver after 2pm',
        authorName: 'Daniel Oyewole',
        author: { id: 'u1' },
      }),
    );
  });

  it('reads receiving accounts from PAYMENT_ACCOUNTS_<country>', () => {
    const { service } = setup(null, 'GTBank, Nigeria | Cash in office');
    expect(service.options('NG').accounts).toEqual([
      'GTBank, Nigeria',
      'Cash in office',
    ]);
    expect(setup(null).service.options('BJ').accounts).toEqual([]);
  });
});
