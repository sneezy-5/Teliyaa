<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import PayHeader from '../components/PayHeader.vue';
import PayPanel from '../components/PayPanel.vue';
import PublicShell from '../components/PublicShell.vue';
import QrBlock from '../components/QrBlock.vue';
import Spinner from '../components/Spinner.vue';
import { api } from '../lib/api';
import { requestLink } from '../lib/links';
import { session } from '../lib/session';
import type { PublicRequest } from '../lib/types';

/** /r/:code — demande avec montant, sans compte */
const route = useRoute();
const req = ref<PublicRequest | null | undefined>(undefined);
const expired = computed(() => req.value?.status === 'open' && new Date(req.value.expires_at) < new Date());
onMounted(() => {
  api.getPublicRequest(route.params.code as string).then((r) => (req.value = r)).catch(() => (req.value = null));
});
</script>

<template>
  <PublicShell>
    <Spinner v-if="req === undefined" />
    <p v-else-if="req === null" class="muted center">Cette demande n'existe pas.</p>
    <div v-else class="stack">
      <PayHeader :profile="req.profile" intro="te demande" :amount="req.amount" :note="req.note" />
      <p v-if="req.status === 'paid'" class="note ok">Cette demande a déjà été payée. Merci !</p>
      <p v-if="req.status === 'declared'" class="note info">Quelqu'un a déjà déclaré avoir payé cette demande.</p>
      <p v-if="req.status === 'cancelled'" class="note">Cette demande a été annulée.</p>
      <p v-if="expired" class="note">Cette demande a expiré.</p>
      <template v-if="req.status === 'open' && !expired">
        <PayPanel
          :profile="req.profile"
          :amount="req.amount"
          :note="req.note"
          :request-code="req.code"
          :favorite-provider="session.profile?.favorite_provider"
          :logged-in="Boolean(session.user && session.profile)"
        />
        <QrBlock :value="requestLink(req.code)" caption="Ou scanne ce QR avec un autre téléphone" :file-name="`demande-${req.code}.png`" />
      </template>
    </div>
  </PublicShell>
</template>
