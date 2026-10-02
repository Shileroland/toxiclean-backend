import type { Booking } from '../bookings/booking.entity.js';
import type { ContactMessage } from '../contact-messages/contact-message.entity.js';
import type { QuoteRequest } from '../quote-requests/quote-request.entity.js';
import type { Language } from '../users/user.entity.js';

export type Email = { subject: string; html: string; text: string };

type Row = [label: string, value: string | null | undefined];

/** The parts of an email; `render` turns them into matching HTML and plain text. */
type Content = {
  subject: string;
  heading: string;
  paragraphs: string[];
  rows?: Row[];
  /** Free text shown as a quoted block, e.g. the customer's message. */
  quote?: { label: string; text: string };
  action?: { label: string; url: string };
  footnote?: string;
};

const copy = {
  en: {
    hi: (name: string) => `Hi ${name},`,
    signOff: 'The Toxiclean team',
    footer: 'Toxiclean Services Ltd. · Nigeria · Benin Republic',
    countries: { NG: 'Nigeria', BJ: 'Benin Republic' } as Record<
      string,
      string
    >,
    contactMethods: {
      whatsapp: 'WhatsApp',
      phone: 'phone',
      email: 'email',
    } as Record<string, string>,
    timeSlots: {
      morning: 'Morning (8am – 12pm)',
      afternoon: 'Afternoon (12pm – 4pm)',
      evening: 'Evening (4pm – 6pm)',
    } as Record<string, string>,
    reset: {
      subject: 'Reset your Toxiclean password',
      heading: 'Reset your password',
      body: 'We received a request to reset your password. Use the button below to choose a new one. The link works once and expires in 1 hour.',
      action: 'Reset password',
      ignore:
        "If you didn't ask for this, you can ignore this email; your password won't change.",
    },
    request: {
      subject: {
        product: (ref: string) =>
          `We've received your product request (${ref})`,
        bulk: (ref: string) =>
          `We've received your bulk quote request (${ref})`,
      },
      heading: {
        product: 'Product request received',
        bulk: 'Bulk quote request received',
      },
      body: (method: string) =>
        `Thanks for your request. Our team will review it and contact you by ${method} to confirm pricing, availability and delivery.`,
      reference: 'Reference',
      products: 'Products',
      delivery: 'Delivery',
      deliveryMethods: { delivery: 'Delivery', pickup: 'Pickup' } as Record<
        string,
        string
      >,
      location: 'Location',
      address: 'Address',
      action: 'View my requests',
    },
    booking: {
      subject: (ref: string) => `We've received your booking (${ref})`,
      heading: 'Booking request received',
      body: (method: string) =>
        `Thanks for booking with Toxiclean. Our team will contact you by ${method} to confirm the inspection date and time.`,
      reference: 'Reference',
      service: 'Service',
      date: 'Preferred date',
      time: 'Preferred time',
      address: 'Address',
    },
    contact: {
      subject: "We've received your message",
      heading: 'Message received',
      body: (method: string) =>
        `Thanks for getting in touch. Our team will reply by ${method} as soon as possible.`,
      yourMessage: 'Your message',
    },
  },
  fr: {
    hi: (name: string) => `Bonjour ${name},`,
    signOff: "L'équipe Toxiclean",
    footer: 'Toxiclean Services Ltd. · Nigeria · Bénin',
    countries: { NG: 'Nigeria', BJ: 'Bénin' } as Record<string, string>,
    contactMethods: {
      whatsapp: 'WhatsApp',
      phone: 'téléphone',
      email: 'e-mail',
    } as Record<string, string>,
    timeSlots: {
      morning: 'Matin (8 h – 12 h)',
      afternoon: 'Après-midi (12 h – 16 h)',
      evening: 'Soir (16 h – 18 h)',
    } as Record<string, string>,
    reset: {
      subject: 'Réinitialisez votre mot de passe Toxiclean',
      heading: 'Réinitialisez votre mot de passe',
      body: 'Nous avons reçu une demande de réinitialisation de votre mot de passe. Utilisez le bouton ci-dessous pour en choisir un nouveau. Le lien ne fonctionne qu’une fois et expire dans 1 heure.',
      action: 'Réinitialiser le mot de passe',
      ignore:
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail ; votre mot de passe ne changera pas.",
    },
    request: {
      subject: {
        product: (ref: string) =>
          `Nous avons bien reçu votre demande de produits (${ref})`,
        bulk: (ref: string) =>
          `Nous avons bien reçu votre demande de devis en gros (${ref})`,
      },
      heading: {
        product: 'Demande de produits reçue',
        bulk: 'Demande de devis en gros reçue',
      },
      body: (method: string) =>
        `Merci pour votre demande. Notre équipe va l'examiner et vous contactera par ${method} pour confirmer les prix, la disponibilité et la livraison.`,
      reference: 'Référence',
      products: 'Produits',
      delivery: 'Livraison',
      deliveryMethods: { delivery: 'Livraison', pickup: 'Retrait' } as Record<
        string,
        string
      >,
      location: 'Lieu',
      address: 'Adresse',
      action: 'Voir mes demandes',
    },
    booking: {
      subject: (ref: string) =>
        `Nous avons bien reçu votre réservation (${ref})`,
      heading: 'Demande de réservation reçue',
      body: (method: string) =>
        `Merci d'avoir réservé avec Toxiclean. Notre équipe vous contactera par ${method} pour confirmer la date et l'heure de l'inspection.`,
      reference: 'Référence',
      service: 'Service',
      date: 'Date souhaitée',
      time: 'Heure souhaitée',
      address: 'Adresse',
    },
    contact: {
      subject: 'Nous avons bien reçu votre message',
      heading: 'Message reçu',
      body: (method: string) =>
        `Merci de nous avoir contactés. Notre équipe vous répondra par ${method} dès que possible.`,
      yourMessage: 'Votre message',
    },
  },
} satisfies Record<Language, unknown>;

const en = copy.en;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const escapeLines = (value: string) => escapeHtml(value).replace(/\n/g, '<br>');

const FONT = "'Open Sans', Arial, Helvetica, sans-serif";

/** Table-based layout with inline styles, which email clients render reliably. */
function render(
  content: Content,
  language: Language,
  webappUrl: string,
): Email {
  const t = copy[language];
  const rows = (content.rows ?? []).filter((row): row is [string, string] =>
    Boolean(row[1]),
  );

  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-top:1px solid #e7e7e7;">${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #e7e7e7;color:#5f5f5f;font-size:14px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #e7e7e7;color:#000;font-size:14px;font-weight:600;">${escapeLines(value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const quoteHtml = content.quote
    ? `<p style="margin:24px 0 8px;color:#5f5f5f;font-size:14px;">${escapeHtml(content.quote.label)}</p><div style="padding:16px;background:#f7f7f7;border-radius:8px;color:#000;font-size:14px;line-height:22px;">${escapeLines(content.quote.text)}</div>`
    : '';
  const actionHtml = content.action
    ? `<p style="margin:32px 0 8px;"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:12px 20px;background:#ff0000;border:1px solid #b50000;border-radius:8px;color:#fff;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(content.action.label)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #f7f7f7;">
<a href="${escapeHtml(webappUrl)}" style="text-decoration:none;"><img src="${escapeHtml(webappUrl)}/icon.png" width="40" height="40" alt="" style="vertical-align:middle;border:0;"> <span style="vertical-align:middle;color:#ff0000;font-size:22px;font-weight:800;letter-spacing:0.5px;">TOXICLEAN</span></a>
</td></tr>
<tr><td style="padding:32px;color:#000;font-size:16px;line-height:24px;">
<h1 style="margin:0 0 24px;font-size:24px;line-height:32px;">${escapeHtml(content.heading)}</h1>
${content.paragraphs.map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p)}</p>`).join('')}
${rowsHtml}${quoteHtml}${actionHtml}
${content.footnote ? `<p style="margin:24px 0 0;color:#5f5f5f;font-size:14px;line-height:22px;">${escapeHtml(content.footnote)}</p>` : ''}
<p style="margin:32px 0 0;">${escapeHtml(t.signOff)}</p>
</td></tr>
<tr><td style="padding:20px 32px;background:#6b0000;color:#e6e6e6;font-size:13px;line-height:20px;">${escapeHtml(t.footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  // French typography puts a space before the colon.
  const colon = language === 'fr' ? ' :' : ':';
  const text = [
    content.heading,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...rows.map(([label, value]) => `${label}${colon} ${value}`),
    ...(rows.length ? [''] : []),
    ...(content.quote
      ? [`${content.quote.label}${colon}`, content.quote.text, '']
      : []),
    ...(content.action
      ? [`${content.action.label}${colon} ${content.action.url}`, '']
      : []),
    ...(content.footnote ? [content.footnote, ''] : []),
    t.signOff,
  ].join('\n');

  return { subject: content.subject, html, text };
}

function formatDate(isoDate: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-BJ' : 'en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** French pages live under /fr on the website. */
export const pagePrefix = (language: Language) =>
  language === 'fr' ? '/fr' : '';

/** "₦450,000" / "XOF 175,000" for team emails. */
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const joinPresent = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(', ');

export function passwordResetEmail(
  link: string,
  language: Language,
  webappUrl: string,
): Email {
  const t = copy[language].reset;
  return render(
    {
      subject: t.subject,
      heading: t.heading,
      paragraphs: [t.body],
      action: { label: t.action, url: link },
      footnote: t.ignore,
    },
    language,
    webappUrl,
  );
}

type Options = { language: Language; webappUrl: string };

export function quoteRequestEmails(
  request: QuoteRequest,
  { language, webappUrl, signedIn }: Options & { signedIn: boolean },
) {
  const t = copy[language];
  const ref = request.reference ?? '';
  const isDelivery = request.deliveryMethod === 'delivery';
  const products = request.items
    .map((item) => `${item.productName} × ${item.quantity}`)
    .join('\n');

  const customer = render(
    {
      subject: t.request.subject[request.kind](ref),
      heading: t.request.heading[request.kind],
      paragraphs: [
        t.hi(request.fullName),
        t.request.body(t.contactMethods[request.preferredContactMethod]),
      ],
      rows: [
        [t.request.reference, ref],
        [t.request.products, products],
        [t.request.delivery, t.request.deliveryMethods[request.deliveryMethod]],
        [
          t.request.location,
          joinPresent(
            request.city,
            request.state,
            t.countries[request.country],
          ),
        ],
        [t.request.address, isDelivery ? request.address : null],
      ],
      action: signedIn
        ? {
            label: t.request.action,
            url: `${webappUrl}${pagePrefix(language)}/account/requests?tab=${request.kind === 'product' ? 'products' : 'bulk'}`,
          }
        : undefined,
    },
    language,
    webappUrl,
  );

  const priced = request.items.every((item) => item.unitPrice !== undefined);
  const total = request.items.reduce(
    (sum, item) => sum + (item.unitPrice ?? 0) * item.quantity,
    0,
  );
  const label =
    request.kind === 'product' ? 'product request' : 'bulk quote request';
  const team = render(
    {
      subject: `New ${label} ${ref} from ${request.fullName}`,
      heading: `New ${label}`,
      paragraphs: [
        `${request.fullName} submitted a ${label}. Reply to this email to reach them directly.`,
      ],
      rows: [
        ['Reference', ref],
        [
          'Products',
          request.items
            .map(
              (item) =>
                `${item.productName} × ${item.quantity}${item.unitPrice !== undefined ? ` (est. ${money(item.unitPrice, request.currency)} each)` : ''}`,
            )
            .join('\n'),
        ],
        ['Estimated total', priced ? money(total, request.currency) : null],
        ['Name', request.fullName],
        ['Organisation', request.organisationName],
        ['Phone', request.phone],
        ['Email', request.email],
        [
          'Preferred contact',
          en.contactMethods[request.preferredContactMethod],
        ],
        ['Delivery', en.request.deliveryMethods[request.deliveryMethod]],
        [
          'Location',
          joinPresent(
            request.city,
            request.state,
            en.countries[request.country],
          ),
        ],
        ['Address', isDelivery ? request.address : null],
        ['Tender reference', request.tenderReference],
        ['Customer language', language === 'fr' ? 'French' : 'English'],
      ],
      quote: request.notes
        ? { label: 'Notes', text: request.notes }
        : undefined,
    },
    'en',
    webappUrl,
  );

  return { customer, team };
}

export function bookingEmails(
  booking: Booking,
  { language, webappUrl }: Options,
) {
  const t = copy[language];
  const ref = booking.reference ?? '';
  const address = joinPresent(
    booking.address,
    booking.city,
    booking.state,
    t.countries[booking.country],
  );

  const customer = render(
    {
      subject: t.booking.subject(ref),
      heading: t.booking.heading,
      paragraphs: [
        t.hi(booking.fullName),
        t.booking.body(t.contactMethods[booking.preferredContactMethod]),
      ],
      rows: [
        [t.booking.reference, ref],
        [t.booking.service, booking.serviceName],
        [t.booking.date, formatDate(booking.preferredDate, language)],
        [t.booking.time, t.timeSlots[booking.preferredTime]],
        [t.booking.address, address],
      ],
    },
    language,
    webappUrl,
  );

  const team = render(
    {
      subject: `New booking ${ref}: ${booking.serviceName}`,
      heading: 'New service booking',
      paragraphs: [
        `${booking.fullName} booked ${booking.serviceName}. Reply to this email to reach them directly.`,
      ],
      rows: [
        ['Reference', ref],
        ['Service', `${booking.serviceName} (${booking.serviceCategory})`],
        ['Property type', booking.propertyType],
        ['Preferred date', formatDate(booking.preferredDate, 'en')],
        ['Preferred time', en.timeSlots[booking.preferredTime]],
        ['Name', booking.fullName],
        ['Phone', booking.phone],
        ['Email', booking.email],
        [
          'Preferred contact',
          en.contactMethods[booking.preferredContactMethod],
        ],
        [
          'Address',
          joinPresent(
            booking.address,
            booking.city,
            booking.state,
            en.countries[booking.country],
          ),
        ],
        [
          'Photos',
          booking.photos.length ? String(booking.photos.length) : null,
        ],
        ['Customer language', language === 'fr' ? 'French' : 'English'],
      ],
      quote: { label: 'Issue', text: booking.issue },
    },
    'en',
    webappUrl,
  );

  return { customer, team };
}

/** Tells the team a customer asked to reschedule or cancel. Team emails are in English. */
export function bookingChangeEmail(
  booking: Booking,
  kind: 'reschedule' | 'cancellation',
  webappUrl: string,
): Email {
  const ref = booking.reference ?? '';
  const current = booking.scheduledDate
    ? `${formatDate(booking.scheduledDate, 'en')}${booking.scheduledTime ? `, ${booking.scheduledTime}` : ''}`
    : `${formatDate(booking.preferredDate, 'en')} (preferred), ${en.timeSlots[booking.preferredTime]}`;
  const reschedule = booking.rescheduleRequest;
  const label = kind === 'reschedule' ? 'Reschedule' : 'Cancellation';
  return render(
    {
      subject: `${label} requested for ${ref}: ${booking.serviceName}`,
      heading: `${label} requested`,
      paragraphs: [
        `${booking.fullName} asked to ${kind === 'reschedule' ? 'move' : 'cancel'} booking ${ref}. Reply to this email to reach them directly.`,
      ],
      rows: [
        ['Reference', ref],
        ['Service', booking.serviceName],
        ['Current schedule', current],
        [
          'Requested schedule',
          reschedule
            ? `${formatDate(reschedule.preferredDate, 'en')}, ${en.timeSlots[reschedule.preferredTime]}`
            : null,
        ],
        ['Name', booking.fullName],
        ['Phone', booking.phone],
        ['Email', booking.email],
      ],
      quote:
        kind === 'cancellation' && booking.cancellationRequest?.reason
          ? { label: 'Reason', text: booking.cancellationRequest.reason }
          : undefined,
    },
    'en',
    webappUrl,
  );
}

export function contactEmails(
  message: ContactMessage,
  { language, webappUrl }: Options,
) {
  const t = copy[language];

  const customer = render(
    {
      subject: t.contact.subject,
      heading: t.contact.heading,
      paragraphs: [
        t.hi(message.fullName),
        t.contact.body(t.contactMethods[message.preferredContactMethod]),
      ],
      quote: { label: t.contact.yourMessage, text: message.message },
    },
    language,
    webappUrl,
  );

  const team = render(
    {
      subject: `New message from ${message.fullName} (${message.topic})`,
      heading: 'New contact message',
      paragraphs: [
        `${message.fullName} sent a message through the website. Reply to this email to reach them directly.`,
      ],
      rows: [
        ['Topic', message.topic],
        ['Name', message.fullName],
        ['Phone', message.phone],
        ['Email', message.email],
        ['Country', en.countries[message.country]],
        [
          'Preferred contact',
          en.contactMethods[message.preferredContactMethod],
        ],
        ['Customer language', language === 'fr' ? 'French' : 'English'],
      ],
      quote: { label: 'Message', text: message.message },
    },
    'en',
    webappUrl,
  );

  return { customer, team };
}
