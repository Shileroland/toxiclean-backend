import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Booking } from '../bookings/booking.entity.js';
import type { ContactMessage } from '../contact-messages/contact-message.entity.js';
import type { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import type { Language } from '../users/user.entity.js';
import {
  bookingChangeEmail,
  bookingEmails,
  contactEmails,
  passwordResetEmail,
  quoteRequestEmails,
  type Email,
} from './templates.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

type Recipient = { email: string; name?: string };

/**
 * Sends transactional email through Brevo. Without BREVO_API_KEY (local development)
 * messages are logged instead. Sending never throws: a failed email is logged and
 * must not fail the request that triggered it.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string | undefined;
  private readonly sender: Recipient | undefined;
  /** Inbox that receives new requests, bookings and messages. */
  private readonly teamEmail: string | undefined;
  private readonly webappUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BREVO_API_KEY') || undefined;
    const fromEmail = config.get<string>('MAIL_FROM_EMAIL');
    this.sender = fromEmail
      ? { email: fromEmail, name: config.get('MAIL_FROM_NAME', 'Toxiclean') }
      : undefined;
    this.teamEmail = config.get<string>('MAIL_TEAM_EMAIL') || undefined;
    this.webappUrl = config
      .get<string>('WEBAPP_URL', 'http://localhost:4000')
      .replace(/\/$/, '');

    if (this.apiKey && !this.sender) {
      this.logger.error(
        'BREVO_API_KEY is set but MAIL_FROM_EMAIL is not; emails will not be sent.',
      );
    }
  }

  sendPasswordReset(to: Recipient, link: string, language: Language) {
    return this.send(to, passwordResetEmail(link, language, this.webappUrl), [
      'password-reset',
    ]);
  }

  /** Confirmation to the customer and a notification to the team. */
  async quoteRequestReceived(
    request: QuoteRequest,
    language: Language,
    signedIn: boolean,
  ) {
    const { customer, team } = quoteRequestEmails(request, {
      language,
      signedIn,
      webappUrl: this.webappUrl,
    });
    const tag = `${request.kind}-request`;
    await Promise.all([
      this.send({ email: request.email, name: request.fullName }, customer, [
        tag,
      ]),
      this.notifyTeam(team, request, [tag]),
    ]);
  }

  async bookingReceived(booking: Booking, language: Language) {
    const { customer, team } = bookingEmails(booking, {
      language,
      webappUrl: this.webappUrl,
    });
    await Promise.all([
      this.send({ email: booking.email, name: booking.fullName }, customer, [
        'booking',
      ]),
      this.notifyTeam(team, booking, ['booking']),
    ]);
  }

  /** Team-only: a customer asked to reschedule or cancel a booking. */
  bookingChangeRequested(
    booking: Booking,
    kind: 'reschedule' | 'cancellation',
  ) {
    return this.notifyTeam(
      bookingChangeEmail(booking, kind, this.webappUrl),
      booking,
      ['booking', kind],
    );
  }

  async contactMessageReceived(message: ContactMessage, language: Language) {
    const { customer, team } = contactEmails(message, {
      language,
      webappUrl: this.webappUrl,
    });
    await Promise.all([
      this.send({ email: message.email, name: message.fullName }, customer, [
        'contact',
      ]),
      this.notifyTeam(team, message, ['contact']),
    ]);
  }

  /** Team emails reply straight to the customer. */
  private notifyTeam(
    email: Email,
    from: { email: string; fullName: string },
    tags: string[],
  ) {
    if (!this.teamEmail) return Promise.resolve();
    return this.send({ email: this.teamEmail }, email, [...tags, 'team'], {
      email: from.email,
      name: from.fullName,
    });
  }

  private async send(
    to: Recipient,
    email: Email,
    tags: string[],
    replyTo?: Recipient,
  ) {
    if (!this.apiKey || !this.sender) {
      this.logger.warn(
        `[email not sent: Brevo not configured] To: ${to.email} | ${email.subject}\n${email.text}`,
      );
      return;
    }
    try {
      const res = await fetch(BREVO_URL, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: this.sender,
          to: [to],
          replyTo,
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
          tags,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(
          `Brevo rejected "${email.subject}" (${res.status}): ${await res.text()}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Could not send "${email.subject}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
