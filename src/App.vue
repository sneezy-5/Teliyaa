<script setup lang="ts">
import { useRoute } from 'vue-router';
import PinGate from './components/PinGate.vue';
import { dataLocked, watchAppSwitches } from './lib/pin';
import { toastMessage } from './lib/toast';

const route = useRoute();
// Reverrouille l'app quand on y revient après une absence
watchAppSwitches();
</script>

<template>
  <!-- Tant que le PIN n'a pas été tapé, le serveur refuse les données : on n'affiche pas la page derrière -->
  <RouterView v-if="!dataLocked(route.path)" />
  <PinGate />
  <div class="toast-zone" aria-live="polite">
    <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
  </div>
</template>
