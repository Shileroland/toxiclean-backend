import { Logger } from '@nestjs/common';
import type { ContactMessage } from '../contact-messages/contact-message.entity.js';
import type { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import { languageFrom } from './language.js';
import { MailService } from './mail.service.js';
import { contactEmails, quoteRequestEmails } from './templates.js';

const configWith = (values: Record<string, string>) =>
  ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  }) as never;

const message = {
  fullName: 'Amaka <b>Obi</b>',
  phone: '+2348034567890',
  email: 'amaka@example.com',
  country: 'NG',
  topic: 'service',
  preferredContactMethod: 'email',
  message: 'Termites <script>alert(1)</script>\nin the warehouse.',
} as ContactMessage;

const request = {
  reference: 'TX-PR-000042',
  kind: 'product',
  currency: 'NGN',
  items: [
    {
      productSlug: 'swingfog-sn-50',
      productName: 'Swingfog SN 50',
      quantity: 2,
      unitPrice: 450000,
    },
  ],
  fullName: 'Ikechukwu Okafor',
  organisationName: null,
  phone: '+2348034567890',
  email: 'ike@example.com',
  country: 'NG',
  deliveryMethod: 'pickup',
  state: null,
  city: null,
  address: null,
  tenderReference: null,
  preferredContactMethod: 'whatsapp',
  notes: null,
} as unknown as QuoteRequest;

afterEach(() => vi.restoreAllMocks());

describe('languageFrom', () => {
  it('reads French from the header and defaults to English', () => {
    expect(languageFrom('fr')).toBe('fr');
    expect(languageFrom('fr-BJ,fr;q=0.9')).toBe('fr');
    expect(languageFrom('en-NG')).toBe('en');
    expect(languageFrom(undefined)).toBe('en');
  });
});

describe('email templates', () => {
  it('escapes customer input in the HTML', () => {
    const { team } = contactEmails(message, {
      language: 'en',
      webappUrl: 'https://toxiclean.example',
    });
    expect(team.html).not.toContain('<script>');
    expect(team.html).toContain('&lt;script&gt;');
    expect(team.html).not.toContain('<b>Obi</b>');
    expect(team.text).toContain('Termites <script>alert(1)</script>');
  });

  it('writes the customer email in their language and the team email in English', () => {
    const { customer, team } = quoteRequestEmails(request, {
      language: 'fr',
      signedIn: true,
      webappUrl: 'https://toxiclean.example',
    });
    expect(customer.subject).toBe(
      'Nous avons bien reçu votre demande de produits (TX-PR-000042)',
    );
    expect(customer.text).toContain('Swingfog SN 50 × 2');
    // French emails link to the French pages.
    expect(customer.text).toContain(
      'https://toxiclean.example/fr/account/requests?tab=products',
    );
    expect(team.subject).toBe(
      'New product request TX-PR-000042 from Ikechukwu Okafor',
    );
    expect(team.text).toContain('Estimated total: ₦900,000');
  });

  it('shows team prices in the currency the customer saw', () => {
    const xofRequest = Object.assign({}, request, {
      currency: 'XOF',
      items: [{ ...request.items[0], unitPrice: 175000 }],
    }) as QuoteRequest;
    const { team } = quoteRequestEmails(xofRequest, {
      language: 'fr',
      signedIn: false,
      webappUrl: 'https://toxiclean.example',
    });
    expect(team.text).toMatch(/Estimated total: F\s?CFA\s?350,000/);
    expect(team.text).not.toContain('₦');
  });

  it('only links to the account when the customer is signed in', () => {
    const { customer } = quoteRequestEmails(request, {
      language: 'en',
      signedIn: false,
      webappUrl: 'https://toxiclean.example',
    });
    expect(customer.text).not.toContain('/account/requests');
  });
});

describe('MailService', () => {
  const brevo = {
    BREVO_API_KEY: 'test-key',
    MAIL_FROM_EMAIL: 'hello@toxiclean.example',
    MAIL_TEAM_EMAIL: 'team@toxiclean.example',
  };

  it('logs instead of sending when Brevo is not configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    await new MailService(configWith({})).contactMessageReceived(message, 'en');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('sends the confirmation and the team notification through Brevo', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 201 }));
    await new MailService(configWith(brevo)).contactMessageReceived(
      message,
      'en',
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const headers = init?.headers as Record<string, string>;
    expect(headers['api-key']).toBe('test-key');
    const bodies = fetchSpy.mock.calls.map(
      ([, req]) => JSON.parse(req?.body as string) as Record<string, unknown>,
    );
    expect(bodies[0]).toMatchObject({
      sender: { email: 'hello@toxiclean.example', name: 'Toxiclean' },
      to: [{ email: 'amaka@example.com' }],
    });
    expect(bodies[1]).toMatchObject({
      to: [{ email: 'team@toxiclean.example' }],
      replyTo: { email: 'amaka@example.com' },
    });
  });

  it('skips the team notification when no team inbox is set', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 201 }));
    const { MAIL_TEAM_EMAIL: _team, ...withoutTeam } = brevo;
    await new MailService(configWith(withoutTeam)).contactMessageReceived(
      message,
      'en',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('never throws when Brevo fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    await expect(
      new MailService(configWith(brevo)).sendPasswordReset(
        { email: 'a@example.com' },
        'https://toxiclean.example/reset-password?token=x',
        'en',
      ),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
