import { api } from './api';
import { copyText } from './links';
import { openProviderApp, type OpenResult } from './openApp';
import { getProvider, isPayerApp } from './providers';
import { refreshProfile, session } from './session';
import type { PublicAlias } from './types';

/**
 * Envoi en un geste : copier l'alias du destinataire et ouvrir MON app tout de suite.
 * L'app du payeur est choisie une seule fois, puis retenue (profil si connecté, sinon ce téléphone).
 */

const APP_KEY = 'tonapp-pay-app';

/** Mon app pour payer, ou null si je ne l'ai pas encore choisie. */
export function preferredApp(): string | null {
  const fromProfile = session.profile?.favorite_provider;
  if (isPayerApp(fromProfile)) return fromProfile!;
  try {
    const saved = localStorage.getItem(APP_KEY);
    // Une banque choisie avant (plus proposée pour payer) : on redemande
    return isPayerApp(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Message après le toucher sur « Payer » (null = l'app s'est ouverte, rien à dire) */
export function payMessage(result: OpenResult, copied: boolean, appName: string): string | null {
  if (result === 'opened') return null;
  if (result === 'store') return copied ? `Alias copié. Touche « Ouvrir » pour aller dans ${appName}, puis colle-le.` : `Touche « Ouvrir » pour aller dans ${appName}.`;
  return copied ? `Alias copié. Ouvre ${appName} et colle-le.` : `Copie impossible. Ouvre ${appName} et recopie l'alias.`;
}

/** Retient l'app choisie, sans faire attendre l'ouverture. */
export function rememberApp(providerId: string): void {
  try {
    localStorage.setItem(APP_KEY, providerId);
  } catch {
    /* rien */
  }
  const p = session.profile;
  if (p && p.favorite_provider !== providerId) {
    void api
      .saveMyProfile({ username: p.username, full_name: p.full_name, favorite_provider: providerId })
      .then(refreshProfile)
      .catch(() => {});
  }
}

/**
 * Quel alias du destinataire utiliser avec mon app :
 * un alias du même établissement si possible (transfert interne), sinon son alias principal.
 */
export function aliasFor(aliases: PublicAlias[], myApp: string): PublicAlias | null {
  return aliases.find((a) => a.provider_id === myApp) ?? aliases.find((a) => a.is_primary) ?? aliases[0] ?? null;
}

/**
 * Copie l'alias puis ouvre l'app, dans le même geste (sinon le téléphone bloque l'ouverture).
 * `unsupported` = l'app ne peut pas être ouverte automatiquement ici : l'alias est quand même copié.
 */
export async function quickPay(alias: PublicAlias, myApp: string): Promise<{ result: OpenResult; copied: boolean }> {
  // La copie prend quelques millisecondes : on l'attend pour que l'alias soit prêt à coller dans l'app.
  const copied = await copyText(alias.value);
  const result = await openProviderApp(getProvider(myApp));
  return { result, copied };
}
