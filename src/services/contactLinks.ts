import type { ContactIcon } from './pdfIcons';

/**
 * Turns the company contact details into clickable URLs.
 * Phone numbers are Argentine: "(011) 4783-1414" → +54 11 4783-1414.
 */

const digits = (s: string) => s.replace(/\D/g, '');

/** National number without the trunk "0" (e.g. "1147831414"), or with the country code kept. */
function argentineNumber(raw: string): { country: boolean; national: string } {
  const d = digits(raw);
  if (raw.trim().startsWith('+') || d.startsWith('54')) return { country: true, national: d.replace(/^54/, '') };
  return { country: false, national: d.replace(/^0/, '') };
}

export function telUrl(raw: string): string | null {
  const { national } = argentineNumber(raw);
  return national.length >= 8 ? `tel:+54${national}` : null;
}

/** wa.me needs the mobile format: 54 9 + area code + number (without the "15" prefix). */
export function whatsappUrl(raw: string): string | null {
  let { national } = argentineNumber(raw);
  if (national.startsWith('9')) national = national.slice(1);
  // "011 15 6447-2550" style: drop the "15" mobile prefix after a 2–4 digit area code.
  national = national.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
  return national.length >= 10 ? `https://wa.me/549${national}` : null;
}

export function mailUrl(raw: string): string | null {
  const email = raw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null;
}

export function mapsUrl(raw: string): string | null {
  const address = raw.trim();
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

export function instagramUrl(raw: string): string | null {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9._]+$/.test(handle) ? `https://instagram.com/${handle}` : null;
}

export function websiteUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function contactUrl(kind: ContactIcon, raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  switch (kind) {
    case 'phone':
      return telUrl(raw);
    case 'whatsapp':
      return whatsappUrl(raw);
    case 'email':
      return mailUrl(raw);
    case 'address':
      return mapsUrl(raw);
    case 'instagram':
      return instagramUrl(raw);
    case 'website':
      return websiteUrl(raw);
  }
}
