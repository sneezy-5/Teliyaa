import { normalizeContactPhone } from './contacts';
import type { AliasType } from './types';

/**
 * L'utilisateur tape juste « son alias ». On devine s'il s'agit d'un numéro ou d'une adresse de paiement :
 * - que des chiffres (avec espaces, tirets, +) → numéro, mis au format international ;
 * - sinon → adresse de paiement PI-SPI, gardée telle quelle.
 */
export type ParsedAlias = { ok: true; type: AliasType; value: string } | { ok: false; error: string };

export function parseAliasInput(raw: string, defaultCountryCode: string): ParsedAlias {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Indique ton alias.' };

  if (/^[\d\s+().-]+$/.test(text)) {
    const phone = normalizeContactPhone(text, defaultCountryCode);
    return phone ? { ok: true, type: 'phone', value: phone } : { ok: false, error: 'Ce numéro semble incomplet. Vérifie-le.' };
  }

  if (text.length < 4 || text.length > 64) return { ok: false, error: "Cet alias semble incorrect. Vérifie-le dans ton app." };
  return { ok: true, type: 'address', value: text };
}
