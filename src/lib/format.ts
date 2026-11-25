/** 15000 → "15 000 FCFA" (espaces normales pour un rendu identique partout) */
export function formatAmount(amount: number): string {
  const n = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n} FCFA`;
}

/** "15 000" ou "15.000" → 15000 ; null si invalide */
export function parseAmount(input: string): number | null {
  const digits = input.replace(/[\s.,]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 ? n : null;
}

export const COUNTRIES = [
  { code: '+225', name: "Côte d'Ivoire", digits: 10, flag: '🇨🇮' },
  { code: '+221', name: 'Sénégal', digits: 9, flag: '🇸🇳' },
  { code: '+226', name: 'Burkina Faso', digits: 8, flag: '🇧🇫' },
  { code: '+223', name: 'Mali', digits: 8, flag: '🇲🇱' },
  { code: '+229', name: 'Bénin', digits: 10, flag: '🇧🇯' },
  { code: '+228', name: 'Togo', digits: 8, flag: '🇹🇬' },
  { code: '+227', name: 'Niger', digits: 8, flag: '🇳🇪' },
  { code: '+245', name: 'Guinée-Bissau', digits: 9, flag: '🇬🇼' }
] as const;

/** Numéro local + indicatif → format E.164 (+2250700000001), ou null si la longueur ne correspond pas. */
export function toE164(countryCode: string, local: string): string | null {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  const digits = local.replace(/\D/g, '');
  if (!country || digits.length !== country.digits) return null;
  return `${country.code}${digits}`;
}

/** +2250700000001 → "+225 07 00 00 00 01" */
export function formatPhone(e164: string): string {
  const country = COUNTRIES.find((c) => e164.startsWith(c.code));
  if (!country) return e164;
  const local = e164.slice(country.code.length);
  const pairs = local.match(/.{1,2}/g) ?? [local];
  return `${country.code} ${pairs.join(' ')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const RESERVED = ['admin', 'support', 'aide', 'help', 'tonapp', 'teliya', 'teliyaa', 'bceao', 'pispi', 'pi-spi', 'wave', 'orange', 'mtn', 'moov', 'banque', 'bank', 'officiel', 'service'];

/** Pseudo : 3 à 20 caractères, minuscules, chiffres, point, tiret ou souligné. Renvoie un message d'erreur ou null. */
export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 3) return 'Au moins 3 caractères.';
  if (u.length > 20) return '20 caractères maximum.';
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(u)) return 'Lettres minuscules, chiffres, « . », « - » ou « _ » (pas au début ni à la fin).';
  if (RESERVED.some((r) => u === r || u.startsWith(`${r}.`) || u.startsWith(`${r}_`))) return 'Ce pseudo est réservé.';
  return null;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

/** Code court lisible pour les demandes (sans 0/O/1/I) */
export function shortCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
