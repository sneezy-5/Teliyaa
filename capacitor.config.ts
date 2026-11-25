import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App mobile (Android + iPhone) construite à partir du même code Vue.
 * Après chaque modification : `npm run cap:sync`, puis lancer depuis Android Studio ou Xcode.
 *
 * CAP_ALLOW_HTTP=1 : version de TEST seulement, pour parler à un serveur encore en http
 * (avant le domaine + https). Ne jamais publier une version construite avec ce réglage.
 */
const allowHttp = process.env.CAP_ALLOW_HTTP === '1';

const config: CapacitorConfig = {
  // Identifiant définitif sur le Play Store / l'App Store : ne plus le changer après publication.
  appId: 'com.teliyaa.app',
  appName: 'Teliyaa',
  webDir: 'dist',
  ...(allowHttp
    ? {
        server: { cleartext: true },
        android: { allowMixedContent: true }
      }
    : {})
};

if (allowHttp) console.warn('⚠️  CAP_ALLOW_HTTP=1 : version de test qui accepte un serveur en http. Ne pas publier.');

export default config;
