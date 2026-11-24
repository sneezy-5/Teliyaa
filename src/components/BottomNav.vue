<script setup lang="ts">
import Icon from './Icon.vue';
import { FEATURES } from '../lib/features';
import type { IconName } from '../lib/icons';

type Key = 'home' | 'send' | 'activity' | 'profile';
defineProps<{ active: Key }>();
const items: { key: Key; to: string; icon: IconName; label: string }[] = [
  { key: 'home', to: '/', icon: 'home', label: 'Accueil' },
  { key: 'send', to: '/send', icon: 'send', label: 'Envoyer' },
  ...(FEATURES.paymentDeclarations ? [{ key: 'activity' as const, to: '/activity', icon: 'list' as const, label: 'Activité' }] : []),
  { key: 'profile', to: '/profile', icon: 'user', label: 'Profil' }
];
</script>

<template>
  <nav class="bottom-nav" aria-label="Navigation principale">
    <RouterLink
      v-for="it in items"
      :key="it.key"
      :to="it.to"
      :class="['nav-item', { active: active === it.key }]"
      :aria-current="active === it.key ? 'page' : undefined"
    >
      <Icon :name="it.icon" :size="22" />
      {{ it.label }}
    </RouterLink>
  </nav>
</template>
