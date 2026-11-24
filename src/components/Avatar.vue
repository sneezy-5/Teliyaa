<script setup lang="ts">
import { initials } from '../lib/format';
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 44 });
</script>

<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.34}px` }" aria-hidden="true">{{ initials(name) }}</span>
</template>
