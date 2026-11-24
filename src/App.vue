<script setup lang="ts">
import { toastMessage } from './lib/toast';
</script>

<template>
  <RouterView />
  <div class="toast-zone" aria-live="polite">
    <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
  </div>
</template>
