// Pure helpers for trusted contacts and the SOS text message (tested with Node:
// scripts/test-sms-text.mts). No React Native imports.

export type Relationship = 'FAMILY' | 'FRIEND' | 'TRAVEL_BUDDY' | 'ORGANIZER' | 'OTHER';

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  FAMILY: 'Family', FRIEND: 'Friend', TRAVEL_BUDDY: 'Travel buddy', ORGANIZER: 'Organizer', OTHER: 'Other',
};

/** Keep digits and a leading +. Returns null if it is not a plausible phone number (7–15 digits, E.164 length). */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  // Only phone characters: a leading +, digits and common separators. Letters, @ etc. are rejected
  // (stripping them silently let "+91900…test@example.com" pass as a number).
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return (plus ? '+' : '') + digits;
}

export function validateContact(c: { name: string; phone: string }): string | null {
  if (!c.name.trim()) return 'Enter a name.';
  if (c.name.trim().length > 60) return 'Keep the name under 60 characters.';
  if (!normalizePhone(c.phone)) return 'Enter a phone number with 7 to 15 digits (include the country code, e.g. +91).';
  return null;
}

const CATEGORY_TEXT = { MEDICAL: 'medical help', RESCUE: 'rescue', GENERAL: 'help' } as const;
const PRIORITY_TEXT = { HIGH: 'Urgent', MEDIUM: 'Needs help soon', LOW: 'Not urgent' } as const;

/** The SOS text the user can choose to send to trusted contacts. States only facts the phone has. */
export function sosSmsText(sos: {
  workerName: string;
  category: keyof typeof CATEGORY_TEXT;
  priority: keyof typeof PRIORITY_TEXT;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}, formatTime: (iso: string) => string): string {
  const where = sos.latitude !== null && sos.longitude !== null
    ? `My location: https://maps.google.com/?q=${sos.latitude.toFixed(5)},${sos.longitude.toFixed(5)}`
    : 'My phone had no location when I sent this.';
  return [
    `SOS from ${sos.workerName}: I need ${CATEGORY_TEXT[sos.category]}. ${PRIORITY_TEXT[sos.priority]}.`,
    where,
    `Sent ${formatTime(sos.createdAt)} from TrackMate. Please try to reach me.`,
  ].join('\n');
}

/** sms: URI for one or more recipients with a prefilled body (Android accepts comma-separated recipients). */
export function smsUri(phones: string[], body: string): string {
  return `sms:${phones.join(',')}?body=${encodeURIComponent(body)}`;
}
