<script setup lang="ts">
import { computed } from 'vue';
import { bankColors, bankInitials, findBank } from '../lib/banks';

/** Pastille d'une banque : son logo s'il a été ajouté (avec accord), sinon ses initiales en couleur. */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 44 });
const bank = computed(() => findBank(props.name));
const short = computed(() => bank.value?.short ?? bankInitials(props.name));
const logo = computed(() => (bank.value?.logo ? `${import.meta.env.BASE_URL}${bank.value.logo}` : null));
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * (short.value.length > 2 ? 0.27 : 0.32))}px`,
  ...(logo.value ? { background: '#fff' } : bankColors(props.name))
}));
</script>

<template>
  <span class="badge-ico bank-badge" :style="style" aria-hidden="true">
    <img v-if="logo" :src="logo" alt="" />
    <template v-else>{{ short }}</template>
  </span>
</template>
