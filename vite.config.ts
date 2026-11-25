import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// `npm run build:demo` = build statique autonome (mode démo, routes en #, chemins relatifs),
// utile pour l'héberger n'importe où sans serveur ni Supabase.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isStaticDemo = mode === 'demo' || env.VITE_ROUTER === 'hash';

  return {
    base: isStaticDemo ? './' : '/',
    // Ouvert sur le réseau local : `npm run dev` affiche une adresse « Network » à ouvrir sur le téléphone (même Wi-Fi).
    // /api → ton serveur lancé en local (cd server && npm run dev), quand VITE_BACKEND=server
    server: { host: true, port: 5173, proxy: { '/api': 'http://localhost:3000' } },
    preview: { host: true, port: 4173 },
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icone-512.png'],
        manifest: {
          name: 'Teliyaa — tous tes alias PI-SPI',
          short_name: 'Teliyaa',
          description: 'Regroupe tes alias PI-SPI et fais-toi payer avec un seul lien.',
          lang: 'fr',
          theme_color: '#4338CA',
          background_color: '#FFFFFF',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            // Logo Teliyaa (le navigateur le réduit lui-même aux autres tailles)
            { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
          ]
        },
        workbox: {
          navigateFallback: isStaticDemo ? undefined : '/index.html',
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
        }
      })
    ]
  };
});
