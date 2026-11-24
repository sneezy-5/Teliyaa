import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App mobile (Android + iPhone) construite à partir du même code Vue.
 * Après chaque modification : `npm run cap:sync`, puis lancer depuis Android Studio ou Xcode.
 */
const config: CapacitorConfig = {
  appId: 'link.tonapp.app',
  appName: 'Teliyaa',
  webDir: 'dist'
};

export default config;
