<script setup lang="ts">
import { ICON_PATHS, type IconName } from '../lib/icons';
withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });
</script>

<template>
  <svg aria-hidden="true" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>
