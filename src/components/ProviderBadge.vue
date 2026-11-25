<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BankBadge from './BankBadge.vue';
import { getProvider, logoUrl } from '../lib/providers';

/**
 * Pastille d'un établissement : son logo (public/logos/, n'importe quel format), sinon ses initiales.
 * Pour un compte « Banque », `label` contient le nom de la banque : on affiche la pastille de cette banque.
 */
const props = defineProps<{ providerId: string; label?: string | null }>();
const provider = computed(() => getProvider(props.providerId));
/** Extension essayée (png, puis svg, jpg…) */
const attempt = ref(0);
watch(() => props.providerId, () => (attempt.value = 0));
const logo = computed(() => logoUrl(provider.value, attempt.value));
</script>

<template>
  <BankBadge v-if="providerId === 'bank' && label" :name="label" />
  <span v-else :class="['badge-ico', { bank: provider.kind === 'bank', 'has-logo': logo }]" aria-hidden="true">
    <img v-if="logo" :src="logo" alt="" @error="attempt++" />
    <template v-else>{{ provider.short }}</template>
  </span>
</template>
