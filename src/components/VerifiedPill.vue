<script setup lang="ts">
import Icon from './Icon.vue';
</script>

<template>
  <!-- Seul le numéro est vérifié (code WhatsApp) : on ne prétend pas vérifier l'identité -->
  <span class="pill ok" title="Numéro de téléphone confirmé par un code. Le nom n'est pas vérifié."><Icon name="check" :size="12" /> Numéro vérifié</span>
</template>
