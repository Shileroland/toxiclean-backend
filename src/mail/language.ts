import type { Language } from '../users/user.entity.js';

/** The visitor's language from the Accept-Language header the webapp forwards. */
export function languageFrom(header: string | undefined): Language {
  return header?.trim().toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
