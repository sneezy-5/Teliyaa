<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import PayHeader from '../components/PayHeader.vue';
import PayPanel from '../components/PayPanel.vue';
import PublicShell from '../components/PublicShell.vue';
import QrBlock from '../components/QrBlock.vue';
import Spinner from '../components/Spinner.vue';
import { api } from '../lib/api';
import { profileLink } from '../lib/links';
import { session } from '../lib/session';
import type { PublicProfile } from '../lib/types';

/** /u/:username — page de paiement permanente, sans compte */
const route = useRoute();
const profile = ref<PublicProfile | null | undefined>(undefined);
onMounted(() => {
  api.getPublicProfile((route.params.username as string).toLowerCase()).then((p) => (profile.value = p)).catch(() => (profile.value = null));
});
</script>

<template>
  <PublicShell>
    <Spinner v-if="profile === undefined" />
    <p v-else-if="profile === null" class="muted center">Cette page n'existe pas.</p>
    <div v-else class="stack">
      <PayHeader :profile="profile" intro="· pour me payer" />
      <PayPanel :profile="profile" :amount="null" note="" :favorite-provider="session.profile?.favorite_provider" :logged-in="Boolean(session.user && session.profile)" />
      <QrBlock :value="profileLink(profile.username)" caption="Ou scanne ce QR avec un autre téléphone" :file-name="`${profile.username}-qr.png`" />
    </div>
  </PublicShell>
</template>
