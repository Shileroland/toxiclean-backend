import { ContactMessagesService } from './contact-messages.service.js';
import type { CreateContactMessageDto } from './dto/create-contact-message.dto.js';

describe('ContactMessagesService', () => {
  const repo = {
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve(data)),
  };
  const mail = { contactMessageReceived: vi.fn(() => Promise.resolve()) };
  const service = new ContactMessagesService(repo as never, mail as never);

  it('stores a trimmed message with a normalised email', async () => {
    const dto = {
      fullName: ' Amaka Obi ',
      phone: '+2348034567890',
      email: 'Amaka@Example.com ',
      country: 'NG',
      topic: 'service',
      preferredContactMethod: 'email',
      message: '  Termites in the warehouse.  ',
    } satisfies CreateContactMessageDto;

    await service.create(dto);

    expect(repo.save).toHaveBeenCalledWith({
      fullName: 'Amaka Obi',
      phone: '+2348034567890',
      email: 'amaka@example.com',
      country: 'NG',
      topic: 'service',
      preferredContactMethod: 'email',
      message: 'Termites in the warehouse.',
    });
    expect(mail.contactMessageReceived).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'amaka@example.com' }),
      'en',
    );
  });
});
