<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Chargement…' });
</script>

<template>
  <div class="center muted" role="status" style="padding: 48px">{{ label }}</div>
</template>
