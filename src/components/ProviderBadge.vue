<script setup lang="ts">
import { computed } from 'vue';
import BankBadge from './BankBadge.vue';
import { getProvider } from '../lib/providers';

/**
 * Pastille d'un établissement : son logo s'il a été ajouté (providers.ts), sinon ses initiales.
 * Pour un compte « Banque », `label` contient le nom de la banque : on affiche la pastille de cette banque.
 */
const props = defineProps<{ providerId: string; label?: string | null }>();
const provider = computed(() => getProvider(props.providerId));
const logo = computed(() => (provider.value.logo ? `${import.meta.env.BASE_URL}${provider.value.logo}` : null));
</script>

<template>
  <BankBadge v-if="providerId === 'bank' && label" :name="label" />
  <span v-else :class="['badge-ico', { bank: provider.kind === 'bank', 'has-logo': logo }]" aria-hidden="true">
    <img v-if="logo" :src="logo" alt="" />
    <template v-else>{{ provider.short }}</template>
  </span>
</template>
