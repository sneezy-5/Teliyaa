<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import QrBlock from '../components/QrBlock.vue';
import ShareButtons from '../components/ShareButtons.vue';
import Spinner from '../components/Spinner.vue';
import StatusPill from '../components/StatusPill.vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api';
import { formatAmount, formatDate } from '../lib/format';
import { prettyLink, requestLink } from '../lib/links';
import { session } from '../lib/session';
import type { PaymentRequest } from '../lib/types';

/** Vue du créateur de la demande : lien à partager + suivi. */
const route = useRoute();
const code = route.params.code as string;
const req = ref<PaymentRequest | null | undefined>(undefined);
const confirmCancel = ref(false);

const load = async () => (req.value = (await api.listMyRequests()).find((r) => r.code === code) ?? null);
onMounted(load);

const link = computed(() => (req.value ? requestLink(req.value.code) : ''));
const message = computed(() => {
  const r = req.value;
  if (!r) return '';
  return `${session.profile?.full_name.split(' ')[0] ?? 'Je'} te demande ${formatAmount(r.amount)}${r.note ? ` (${r.note})` : ''}. Paie depuis ton app habituelle :`;
});

async function cancel() {
  if (!req.value) return;
  await api.setRequestStatus(req.value.id, 'cancelled');
  confirmCancel.value = false;
  await load();
}
</script>

<template>
  <Spinner v-if="req === undefined" />
  <main v-else-if="req === null" class="page">
    <TopBar title="Demande" back="/activity" />
    <p class="muted">Demande introuvable.</p>
  </main>
  <main v-else class="page">
    <TopBar title="Ta demande" back="/activity" />
    <div class="stack">
      <div class="card center-col">
        <StatusPill :request="req" />
        <span class="amount-big">{{ formatAmount(req.amount) }}</span>
        <span v-if="req.note">{{ req.note }}</span>
        <span class="muted small">Créée le {{ formatDate(req.created_at) }} · valable jusqu'au {{ formatDate(req.expires_at) }}</span>
        <span v-if="req.payer_name" class="small">Payée par {{ req.payer_name }}</span>
      </div>

      <template v-if="req.status === 'open'">
        <h2>Envoyer la demande</h2>
        <ShareButtons :message="message" :link="link" />
        <div class="bubble">
          {{ message }} <span class="link-in-bubble">{{ prettyLink(link) }}</span>
        </div>
        <p class="muted small">
          La personne ouvre le lien, choisit son app (Wave, Orange Money…) et paie. Elle n'a pas besoin d'avoir tonapp.
        </p>
        <QrBlock :value="link" caption="À scanner avec l'appareil photo" :file-name="`demande-${req.code}.png`" />
        <button v-if="!confirmCancel" type="button" class="btn ghost danger-text" @click="confirmCancel = true">Annuler la demande</button>
        <div v-else class="card stack">
          <strong>Annuler cette demande ? Le lien ne marchera plus.</strong>
          <div class="grid2">
            <button type="button" class="btn secondary" @click="confirmCancel = false">Non</button>
            <button type="button" class="btn danger" @click="cancel">Oui, annuler</button>
          </div>
        </div>
      </template>

      <RouterLink v-if="req.status === 'declared'" to="/activity?tab=received" class="btn">Vérifier et confirmer le paiement</RouterLink>
    </div>
  </main>
</template>
