import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdminLeadsService } from './admin-leads.service.js';

const booking = {
  id: 4,
  reference: 'TX-BK-000004',
  serviceName: 'General Pest Control',
  propertyType: 'commercial',
  address: '12 Allen Avenue',
  city: 'Ikeja',
  state: 'Lagos',
  preferredDate: '2026-10-20',
  preferredTime: 'morning',
  issue: 'Signs of infestation around the kitchen.',
  photos: [{ originalName: 'pest-photo-01.jpg', fileName: 'x.jpg' }],
  fullName: 'Chinedu Okafor',
  phone: '+2348034567890',
  email: 'chinedu@example.com',
  preferredContactMethod: 'whatsapp',
  customer: { id: 'c1', name: 'Greenfield Hotels' },
};

function setup(
  lead: object = {},
  staff: object | null = null,
  proforma: object | null = null,
  paid: object[] = [],
) {
  const row = {
    id: 1,
    reference: 'TX-LD-000001',
    source: 'service_booking',
    country: 'NG',
    status: 'new',
    booking,
    quoteRequest: null,
    assignedTo: null,
    contacts: [],
    createdAt: new Date('2026-09-24T09:42:00Z'),
    ...lead,
  };
  const leads = {
    findOne: vi.fn(() => Promise.resolve(row)),
    update: vi.fn(() => Promise.resolve()),
  };
  const contacts = {
    create: vi.fn((data: object) => data),
    save: vi.fn(() => Promise.resolve()),
  };
  const bookings = { update: vi.fn(() => Promise.resolve()) };
  const requests = { update: vi.fn(() => Promise.resolve()) };
  const users = { findOne: vi.fn(() => Promise.resolve(staff)) };
  const people = {
    get: vi.fn(() => Promise.resolve({ id: 'c1' })),
    location: vi.fn(() =>
      Promise.resolve({
        id: 'l1',
        country: 'NG',
        state: 'Lagos',
        city: 'Ikeja',
        address: '12 Allen Avenue',
      }),
    ),
    forBooking: vi.fn(() => Promise.resolve({ id: 'c1' })),
    listLocations: vi.fn(() => Promise.resolve([])),
  };
  const adminBookings = {
    schedule: vi.fn(() => Promise.resolve({ id: 4, status: 'scheduled' })),
  };
  const storage = {
    put: vi.fn(() => Promise.resolve('local')),
    delete: vi.fn(() => Promise.resolve()),
  };
  const inventory = { reserveFor: vi.fn(() => Promise.resolve()) };
  const service = new AdminLeadsService(
    leads as never,
    contacts as never,
    bookings as never,
    requests as never,
    users as never,
    { findOne: vi.fn(() => Promise.resolve(proforma)) } as never,
    { find: vi.fn(() => Promise.resolve(paid)) } as never,
    storage as never,
    people as never,
    adminBookings as never,
    inventory as never,
    { linkedTo: vi.fn(() => Promise.resolve(null)) } as never,
  );
  return {
    service,
    leads,
    contacts,
    bookings,
    requests,
    storage,
    adminBookings,
  };
}

const contact = {
  method: 'whatsapp' as const,
  date: '2026-10-14',
  time: '15:00',
  note: 'Customer confirmed the pest problem.',
};
const staffUser = { id: 'u1', fullName: 'Umar Idris', role: 'admin' };

describe('AdminLeadsService', () => {
  it('shows the customer record’s name and hides photo file names', async () => {
    const { service } = setup();
    const lead = await service.get(1);
    expect(lead.customer).toMatchObject({
      name: 'Greenfield Hotels',
      contactName: 'Chinedu Okafor',
      customerId: 'c1',
    });
    expect(lead.booking?.photos).toEqual([
      { originalName: 'pest-photo-01.jpg' },
    ]);
    expect(lead.booking?.address).toBe('12 Allen Avenue, Ikeja, Lagos');
  });

  it('moves a new lead to Contacted once the customer is reached', async () => {
    const { service, leads, contacts } = setup();
    await service.logContact(
      1,
      { ...contact, outcome: 'customer_reached' },
      staffUser as never,
    );
    expect(contacts.save).toHaveBeenCalled();
    expect(leads.update).toHaveBeenCalledWith(1, { status: 'contacted' });
  });

  it('keeps the lead New when there was no response', async () => {
    const { service, leads } = setup();
    await service.logContact(
      1,
      { ...contact, outcome: 'no_response' },
      staffUser as never,
    );
    expect(leads.update).not.toHaveBeenCalled();
  });

  it('closes the booking request when the lead is lost', async () => {
    const { service, leads, bookings } = setup();
    await service.markLost(1, { reason: 'price_not_accepted' });
    expect(leads.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: 'lost',
        lostReason: 'price_not_accepted',
      }),
    );
    expect(bookings.update).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ status: 'closed' }),
    );
  });

  it('declines the bulk quote when its lead is lost', async () => {
    const { service, requests } = setup({
      source: 'bulk_quote',
      booking: null,
      quoteRequest: {
        id: 9,
        items: [],
        fullName: 'Koffi',
        organisationName: 'Atlas Foods',
      },
    });
    await service.markLost(1, { reason: 'other', note: 'Bought elsewhere.' });
    expect(requests.update).toHaveBeenCalledWith(9, {
      status: 'declined',
      declineReason: 'Bought elsewhere.',
    });
  });

  it('only assigns staff members', async () => {
    const { service } = setup({}, { id: 'u2', role: 'customer' });
    await expect(service.assign(1, 'u2')).rejects.toThrow(BadRequestException);
  });

  it('refuses changes to a closed lead', async () => {
    const { service } = setup({ status: 'lost' });
    await expect(
      service.logContact(
        1,
        { ...contact, outcome: 'customer_reached' },
        staffUser as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  const survey = {
    date: '2026-10-15',
    surveyedById: 'u1',
    pestsIdentified: 'Rats',
    findings: 'Droppings near the storage shelves.',
    areas: [
      {
        name: 'Kitchen',
        length: 4,
        width: 3,
        condition: 'furnished' as const,
        containsStock: true,
      },
    ],
    landArea: 250,
    bushClearing: false,
    clearArea: 100,
    entryPoints: 6,
    baitStations: 12,
    followUpVisits: 3,
    recommendedTreatment: 'Bait stations and sealing.',
  };

  it('saves the survey with the surveyor’s name and keeps its photos', async () => {
    const photo = {
      fileName: 'a.jpg',
      originalName: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 1,
    };
    const { service, leads } = setup(
      { status: 'contacted', survey: { photos: [photo] } },
      staffUser,
    );
    await service.saveSurvey(1, survey);
    expect(leads.update).toHaveBeenCalledWith(1, {
      survey: expect.objectContaining({
        surveyedBy: { id: 'u1', fullName: 'Umar Idris' },
        // No bush clearing, so no area to clear.
        clearArea: null,
        estimatedScope: null,
        photos: [photo],
      }),
    });
  });

  it('only accepts staff as the surveyor', async () => {
    const { service } = setup({}, { id: 'u2', role: 'customer' });
    await expect(
      service.saveSurvey(1, { ...survey, surveyedById: 'u2' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('limits a survey to five photos', async () => {
    const photos = Array.from({ length: 5 }, (_, i) => ({
      fileName: `${i}.jpg`,
    }));
    const { service, storage } = setup({ survey: { photos } });
    await expect(
      service.addSurveyPhotos(1, [
        {
          buffer: Buffer.from([0xff, 0xd8, 0xff]),
          originalname: 'x.jpg',
          size: 3,
        },
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('needs a survey before photos can be added', async () => {
    const { service } = setup({ survey: null });
    await expect(service.addSurveyPhotos(1, [])).rejects.toThrow(
      ConflictException,
    );
  });

  const booking = {
    customerId: 'c1',
    locationId: 'l1',
    serviceCategory: 'pest-control',
    serviceSlug: 'termite-control',
    serviceName: 'Termite Control',
    propertyType: 'commercial' as const,
    date: '2026-11-20',
    startTime: '09:00',
    endTime: '12:00',
    fumigatorIds: ['f1'],
    treatmentPlan: 'Targeted rodent control.',
  };

  it('converts a lead by scheduling its booking, and wins the lead', async () => {
    const { service, bookings, adminBookings, leads } = setup({
      status: 'quoted',
    });
    await service.convert(1, booking, []);
    expect(bookings.update).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        serviceName: 'Termite Control',
        address: '12 Allen Avenue',
        customer: { id: 'c1' },
        // The customer's own notes are kept when none are given.
        issue: 'Signs of infestation around the kitchen.',
      }),
    );
    expect(adminBookings.schedule).toHaveBeenCalledWith(4, booking);
    expect(leads.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'won' }),
    );
  });

  it('waits for the accepted proforma’s deposit before converting', async () => {
    const accepted = { id: 5, status: 'accepted', depositAmount: 322_500 };
    const unpaid = setup({ status: 'quoted' }, null, accepted, [
      { amount: 100_000 },
    ]);
    await expect(unpaid.service.convert(1, booking, [])).rejects.toThrow(
      'Convert once the customer has accepted the proforma and paid the deposit.',
    );
    expect(unpaid.adminBookings.schedule).not.toHaveBeenCalled();
    const paid = setup({ status: 'quoted' }, null, accepted, [
      { amount: 322_500 },
    ]);
    await expect(paid.service.convert(1, booking, [])).resolves.toBeTruthy();
  });

  it('only converts service leads to jobs', async () => {
    const { service } = setup({
      booking: null,
      quoteRequest: { id: 9, items: [] },
    });
    await expect(service.convert(1, booking, [])).rejects.toThrow(
      BadRequestException,
    );
  });

  const bulkLead = {
    source: 'bulk_quote',
    status: 'quoted',
    booking: null,
    quoteRequest: {
      id: 9,
      items: [
        {
          productSlug: 'solo-425',
          productName: 'Solo 425 Backpack Sprayer',
          quantity: 20,
        },
      ],
      deliveryMethod: 'delivery',
      address: 'Old address',
      city: 'Ikeja',
      state: 'Lagos',
    },
  };
  const quote = {
    id: 7,
    status: 'accepted',
    currency: 'NGN',
    total: 2_778_750,
    lines: [
      {
        section: 'products',
        description: 'Solo 425 Backpack Sprayer',
        quantity: 20,
        unitRate: 120_000,
      },
      {
        section: 'products',
        description: 'Spray Nozzle Kit',
        quantity: 10,
        unitRate: 45_000,
      },
    ],
    fulfilment: {
      method: 'delivery',
      address: 'Warehouse 12, Oba Akran Avenue, Ikeja, Lagos',
    },
  };

  it('turns an accepted bulk quotation into a confirmed purchase request', async () => {
    const { service, requests, leads } = setup(bulkLead, null, quote);
    await service.convertToRequest(1);
    expect(requests.update).toHaveBeenCalledWith(9, {
      items: [
        {
          productSlug: 'solo-425',
          productName: 'Solo 425 Backpack Sprayer',
          quantity: 20,
          agreedUnitPrice: 120_000,
        },
        // Products added on the quote get a slug from their name.
        {
          productSlug: 'spray-nozzle-kit',
          productName: 'Spray Nozzle Kit',
          quantity: 10,
          agreedUnitPrice: 45_000,
        },
      ],
      currency: 'NGN',
      confirmedTotal: 2_778_750,
      status: 'confirmed',
      deliveryMethod: 'delivery',
      address: 'Warehouse 12, Oba Akran Avenue, Ikeja, Lagos',
      city: null,
      state: null,
    });
    expect(leads.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'won' }),
    );
  });

  it('waits for the customer to accept the quotation', async () => {
    const { service, requests } = setup(bulkLead, null, {
      ...quote,
      status: 'sent',
    });
    await expect(service.convertToRequest(1)).rejects.toThrow(
      ConflictException,
    );
    expect(requests.update).not.toHaveBeenCalled();
  });
});
