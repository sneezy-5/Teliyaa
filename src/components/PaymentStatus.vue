<script setup lang="ts">
import type { Payment } from '../lib/types';
defineProps<{ payment: Payment }>();
</script>

<template>
  <span v-if="payment.status === 'confirmed'" class="pill ok">Confirmé</span>
  <span v-else-if="payment.status === 'rejected'" class="pill">Non reçu</span>
  <span v-else class="pill info">À confirmer</span>
</template>
