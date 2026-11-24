import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import type { Provider } from './providers';

export type OpenResult = 'opened' | 'unsupported';

/**
 * On ne peut pas remplir le transfert à la place de l'app, mais on peut l'OUVRIR
 * (l'alias a été copié juste avant).
 *
 * - App tonapp installée (Capacitor) : Android lance l'app directement par son nom de paquet ;
 *   iPhone par son lien d'ouverture (iosScheme). C'est la seule façon fiable d'ouvrir l'app.
 * - Navigateur : Chrome n'ouvre une app que si elle accepte d'être ouverte depuis le web
 *   (catégorie BROWSABLE). Ce n'est pas le cas de l'écran d'accueil de Wave, Orange Money… :
 *   Chrome renvoie alors vers le Play Store. Dans le navigateur, on copie donc l'alias sans ouvrir,
 *   sauf sur iPhone si l'app a un lien d'ouverture.
 *
 * À tester sur vrais téléphones pour chaque établissement (providers.ts).
 */
export async function openProviderApp(provider: Provider, userAgent = navigator.userAgent): Promise<OpenResult> {
  if (Capacitor.isNativePlatform()) {
    const target = Capacitor.getPlatform() === 'android' ? provider.androidPackage : provider.iosScheme;
    if (!target) return 'unsupported';
    try {
      const { completed } = await AppLauncher.openUrl({ url: target });
      return completed ? 'opened' : 'unsupported';
    } catch {
      return 'unsupported'; // app non installée
    }
  }

  const url = providerOpenUrl(provider, userAgent);
  if (!url) return 'unsupported';
  window.location.href = url;
  return 'opened';
}

/** Lien d'ouverture utilisable depuis le navigateur (iPhone seulement, voir plus haut). */
export function providerOpenUrl(provider: Provider, userAgent: string): string | null {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  if (isIOS && provider.iosScheme) return provider.iosScheme;
  return null;
}
