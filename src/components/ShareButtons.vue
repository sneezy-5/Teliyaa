<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import { canNativeShare, copyText, shareText, smsLink, whatsappLink } from '../lib/links';
import { toast } from '../lib/toast';

/**
 * Partager un lien de paiement : WhatsApp, SMS, menu du téléphone (toutes les apps), copier.
 * Le message et le lien partent ensemble, pour que la personne sache tout de suite de quoi il s'agit.
 */
const props = defineProps<{ message: string; link: string }>();

const full = computed(() => `${props.message} ${props.link}`);
const nativeShare = canNativeShare();

const more = () => shareText(props.message, props.link);
const copy = async () => toast((await copyText(full.value)) ? 'Message copié' : 'Copie impossible');
</script>

<template>
  <nav :class="['quick-actions', { four: nativeShare }]" aria-label="Partager">
    <a :href="whatsappLink(full)" target="_blank" rel="noopener" class="quick">
      <span class="quick-ico"><Icon name="chat" :size="24" /></span> WhatsApp
    </a>
    <a :href="smsLink(full)" class="quick">
      <span class="quick-ico"><Icon name="sms" :size="24" /></span> SMS
    </a>
    <button v-if="nativeShare" type="button" class="quick" @click="more">
      <span class="quick-ico"><Icon name="more" :size="24" /></span> Autres
    </button>
    <button type="button" class="quick" @click="copy">
      <span class="quick-ico"><Icon name="copy" :size="24" /></span> Copier
    </button>
  </nav>
</template>
