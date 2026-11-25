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

/**
 * Ctrl+Maj+A (Cmd+Maj+A sur Mac), ou Alt+Maj+A si le navigateur garde Ctrl+Maj+A pour lui (Chrome).
 * Sur Mac, Alt transforme la lettre (« Å » en QWERTY, « Æ » en AZERTY) : on les accepte aussi.
 */
function onKey(e: KeyboardEvent) {
  const isA = ['a', 'å', 'æ'].includes(e.key.toLowerCase()) || e.code === 'KeyA';
  if (!isA || !e.shiftKey || !(e.ctrlKey || e.metaKey || e.altKey)) return;
  if (!session.user?.is_admin) return;
  e.preventDefault();
  e.stopPropagation();
  adminOpen.value = !adminOpen.value;
}
// Phase de capture : on reçoit la touche avant le reste de la page
onMounted(() => window.addEventListener('keydown', onKey, true));
onUnmounted(() => window.removeEventListener('keydown', onKey, true));

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
