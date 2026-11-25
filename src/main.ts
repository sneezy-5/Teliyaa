import { Capacitor } from '@capacitor/core';
import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import { router } from './router';
import './styles.css';

// Service worker : rend la PWA installable et la met à jour automatiquement.
// Inutile dans l'app Capacitor (les fichiers sont déjà dans l'app, et iOS ne le gère pas).
if (!Capacitor.isNativePlatform()) registerSW({ immediate: true });

/**
 * index.html contient la vitrine (page statique pour Google), affichée sur « / » aux visiteurs non connectés.
 * Dans ce cas on ne démarre pas l'app : ses boutons mènent à /login, qui la démarre.
 * Partout ailleurs (autre page, connecté, app mobile, démo) : on retire la vitrine et l'app prend la place.
 */
const vitrine = document.getElementById('vitrine');
const isDemo = import.meta.env.MODE === 'demo' || import.meta.env.VITE_ROUTER === 'hash';
const showVitrine = Boolean(vitrine) && !isDemo && !document.documentElement.classList.contains('in-app');

if (showVitrine) {
  // Revenir sur l'onglet après s'être connecté ailleurs : on bascule dans l'app
  window.addEventListener('pageshow', (e) => {
    try {
      if (e.persisted && localStorage.getItem('teliyaa-session')) location.reload();
    } catch {
      /* stockage indisponible */
    }
  });
} else {
  vitrine?.remove();
  createApp(App).use(router).mount('#root');
}
