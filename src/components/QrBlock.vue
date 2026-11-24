<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import QRCode from 'qrcode';
import Icon from './Icon.vue';

/**
 * QR de la v1 : il contient le LIEN de la page (on le scanne avec l'appareil photo).
 * Étape suivante (plan, fonctionnalité 9) : générer le QR PI-SPI officiel BCEAO
 * (alias + montant), lisible directement par les apps de paiement.
 */
const props = withDefaults(defineProps<{ value: string; caption: string; fileName?: string }>(), { fileName: 'tonapp-qr.png' });
const src = ref<string | null>(null);

watchEffect(async (onCleanup) => {
  let alive = true;
  onCleanup(() => (alive = false));
  try {
    const url = await QRCode.toDataURL(props.value, { margin: 1, width: 480, color: { dark: '#12201B', light: '#FFFFFF' } });
    if (alive) src.value = url;
  } catch {
    if (alive) src.value = null;
  }
});
</script>

<template>
  <div class="card qr">
    <img v-if="src" :src="src" :alt="`QR code : ${caption}`" width="200" height="200" />
    <div v-else class="qr-placeholder" />
    <p class="muted small center">{{ caption }}</p>
    <a v-if="src" class="btn secondary" :href="src" :download="fileName"><Icon name="qr" :size="18" /> Enregistrer le QR</a>
  </div>
</template>
