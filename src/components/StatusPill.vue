<script setup lang="ts">
import { computed } from 'vue';
import type { PaymentRequest } from '../lib/types';

const props = defineProps<{ request: PaymentRequest }>();
const LABELS = {
  open: ['En attente', 'warn'],
  declared: ['À confirmer', 'info'],
  paid: ['Payée', 'ok'],
  cancelled: ['Annulée', '']
} as const;
const pill = computed(() => {
  const expired = props.request.status === 'open' && new Date(props.request.expires_at) < new Date();
  return expired ? (['Expirée', ''] as const) : LABELS[props.request.status];
});
</script>

<template>
  <span :class="['pill', pill[1]]">{{ pill[0] }}</span>
</template>
