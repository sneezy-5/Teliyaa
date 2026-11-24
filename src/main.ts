import { Capacitor } from '@capacitor/core';
import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import { router } from './router';
import './styles.css';

// Service worker : rend la PWA installable et la met à jour automatiquement.
// Inutile dans l'app Capacitor (les fichiers sont déjà dans l'app, et iOS ne le gère pas).
if (!Capacitor.isNativePlatform()) registerSW({ immediate: true });

createApp(App).use(router).mount('#root');
