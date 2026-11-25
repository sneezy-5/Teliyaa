import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import type { Provider } from './providers';

/**
 * - opened : l'app elle-même s'est ouverte (app Teliyaa installée)
 * - store : on a ouvert la fiche de l'app dans le Play Store / l'App Store (bouton « Ouvrir »)
 * - unsupported : rien n'a pu être ouvert ici (ordinateur…), l'alias est seulement copié
 */
export type OpenResult = 'opened' | 'store' | 'unsupported';

/**
 * On ne peut pas remplir le transfert à la place de l'app, mais on peut l'OUVRIR
 * (l'alias a été copié juste avant).
 *
 * - App Teliyaa installée (Capacitor) : Android lance l'app directement par son nom de paquet ;
 *   iPhone par son lien d'ouverture (iosScheme).
 * - Navigateur : impossible d'ouvrir directement Wave, Orange Money… On ouvre donc leur fiche dans le
 *   store du téléphone : un toucher sur « Ouvrir » et on y est (ou « Installer » si on ne l'a pas).
 */
export async function openProviderApp(provider: Provider, userAgent = navigator.userAgent): Promise<OpenResult> {
  if (Capacitor.isNativePlatform()) {
    const target = Capacitor.getPlatform() === 'android' ? provider.androidPackage : provider.iosScheme;
    if (target) {
      try {
        const { completed } = await AppLauncher.openUrl({ url: target });
        if (completed) return 'opened';
      } catch {
        /* app non installée : on propose le store */
      }
    }
  }

  const url = providerOpenUrl(provider, userAgent);
  if (!url) return 'unsupported';
  window.location.href = url;
  return 'store';
}

/** Lien du store selon le téléphone (null sur ordinateur, ou si l'app n'y est pas connue). */
export function providerOpenUrl(provider: Provider, userAgent: string): string | null {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return provider.iosScheme ?? provider.appStoreUrl ?? null;
  if (/Android/i.test(userAgent)) return provider.playStoreUrl ?? null;
  return null;
}
