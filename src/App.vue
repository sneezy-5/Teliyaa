<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import PinGate from './components/PinGate.vue';
import { dataLocked, needsPin, watchAppSwitches } from './lib/pin';
import { session } from './lib/session';
import { toastMessage } from './lib/toast';

const route = useRoute();
// Reverrouille l'app quand on y revient après une absence
watchAppSwitches();

/**
 * Back-office : aucune adresse, il s'ouvre seulement avec Ctrl+Maj+A (Cmd+Maj+A sur Mac),
 * pour les administrateurs. Le serveur refuse de toute façon les autres comptes.
 * Chargé à la demande : son code n'est pas téléchargé par les utilisateurs.
 */
const AdminPanel = defineAsyncComponent(() => import('./pages/Admin.vue'));
const adminOpen = ref(false);

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a' && session.user?.is_admin) {
    e.preventDefault();
    adminOpen.value = !adminOpen.value;
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

// Fermé dès qu'on se déconnecte, ou que l'app se reverrouille (PIN)
watch(
  () => !session.user?.is_admin || needsPin(route.path),
  (hide) => {
    if (hide) adminOpen.value = false;
  }
);
// Écran large pendant que le back-office est ouvert
watchEffect(() => document.documentElement.classList.toggle('wide', adminOpen.value));
</script>

<template>
  <!-- Tant que le PIN n'a pas été tapé, le serveur refuse les données : on n'affiche pas la page derrière -->
  <RouterView v-if="!dataLocked(route.path)" />
  <div v-if="adminOpen" class="admin-layer">
    <AdminPanel @close="adminOpen = false" />
  </div>
  <PinGate />
  <div class="toast-zone" aria-live="polite">
    <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
  </div>
</template>
