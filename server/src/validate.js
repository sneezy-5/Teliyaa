/**
 * Règles partagées avec l'app (src/lib/format.ts) : numéros UEMOA, pseudos, alias.
 * Le serveur revérifie tout : on ne fait jamais confiance à ce que le client envoie.
 */
import { HttpError } from './http.js';

export const COUNTRIES = [
  { code: '+225', digits: 10 },
  { code: '+221', digits: 9 },
  { code: '+226', digits: 8 },
  { code: '+223', digits: 8 },
  { code: '+229', digits: 10 },
  { code: '+228', digits: 8 },
  { code: '+227', digits: 8 },
  { code: '+245', digits: 9 }
];

/** Numéro E.164 d'un pays UEMOA (+2250700000001) */
export function isUemoaPhone(value) {
  if (typeof value !== 'string' || !/^\+\d+$/.test(value)) return false;
  return COUNTRIES.some((c) => value.startsWith(c.code) && value.length === c.code.length + c.digits);
}

export function requirePhone(value) {
  if (!isUemoaPhone(value)) throw new HttpError(400, 'Numéro de téléphone invalide.');
  return value;
}

const RESERVED = ['admin', 'support', 'aide', 'help', 'tonapp', 'teliya', 'teliyaa', 'bceao', 'pispi', 'pi-spi', 'wave', 'orange', 'mtn', 'moov', 'banque', 'bank', 'officiel', 'service'];

export function normalizeUsername(raw) {
  return String(raw ?? '').trim().replace(/^@/, '').toLowerCase();
}

/** Message d'erreur, ou null si le pseudo est valide. */
export function usernameError(u) {
  if (u.length < 3) return 'Au moins 3 caractères.';
  if (u.length > 20) return '20 caractères maximum.';
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(u)) return 'Lettres minuscules, chiffres, « . », « - » ou « _ » (pas au début ni à la fin).';
  if (RESERVED.some((r) => u === r || u.startsWith(`${r}.`) || u.startsWith(`${r}_`))) return 'Ce pseudo est réservé.';
  return null;
}

export function optionalBool(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new HttpError(400, `${name} doit être vrai ou faux.`);
  return value;
}

export function providerId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,40}$/.test(value)) throw new HttpError(400, 'Établissement invalide.');
  return value;
}

/** Valide un alias envoyé par l'app. */
export function aliasInput(body) {
  const alias_type = body?.alias_type;
  if (alias_type !== 'phone' && alias_type !== 'address') throw new HttpError(400, "Type d'alias invalide.");
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  if (alias_type === 'phone' && !isUemoaPhone(value)) throw new HttpError(400, 'Ce numéro semble incomplet. Vérifie-le.');
  if (alias_type === 'address' && (value.length < 4 || value.length > 64)) throw new HttpError(400, 'Cet alias semble incorrect.');
  const label = body.label == null || body.label === '' ? null : String(body.label).trim().slice(0, 40) || null;
  return {
    provider_id: providerId(body.provider_id),
    alias_type,
    value,
    label,
    is_primary: Boolean(body.is_primary),
    visible: body.visible === undefined ? true : Boolean(body.visible)
  };
}
