<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BottomNav from '../components/BottomNav.vue';
import PaymentStatus from '../components/PaymentStatus.vue';
import Spinner from '../components/Spinner.vue';
import StatusPill from '../components/StatusPill.vue';
import { api } from '../lib/api';
import { FEATURES } from '../lib/features';
import { formatAmount, formatDate } from '../lib/format';
import { getProvider } from '../lib/providers';
import type { Payment, PaymentRequest } from '../lib/types';

type Tab = 'requests' | 'received' | 'sent';
const route = useRoute();
const router = useRouter();
const defaultTab: Tab = FEATURES.paymentRequests ? 'requests' : 'received';
const tab = computed<Tab>(() => {
  const t = route.query.tab as Tab | undefined;
  return t && (t !== 'requests' || FEATURES.paymentRequests) ? t : defaultTab;
});
const requests = ref<PaymentRequest[] | null>(null);
const payments = ref<{ sent: Payment[]; received: Payment[] } | null>(null);
const pending = computed(() => payments.value?.received.filter((p) => p.status === 'declared').length ?? 0);

function load() {
  if (FEATURES.paymentRequests) api.listMyRequests().then((r) => (requests.value = r));
  api.listMyPayments().then((p) => (payments.value = p));
}
onMounted(load);

const setTab = (t: Tab) => router.replace({ query: { tab: t } });
async function setStatus(p: Payment, status: 'confirmed' | 'rejected') {
  await api.setPaymentStatus(p.id, status);
  load();
}
const tabs: { key: Tab; label: string }[] = [
  ...(FEATURES.paymentRequests ? [{ key: 'requests' as const, label: 'Demandes' }] : []),
  { key: 'received', label: 'Reçus' },
  { key: 'sent', label: 'Envoyés' }
];
</script>

<template>
  <main class="page with-nav">
    <header class="hello"><h1>Activité</h1></header>
    <div :class="['tabs', { two: tabs.length === 2 }]" role="tablist">
      <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key" :class="['tab', { on: tab === t.key }]" @click="setTab(t.key)">
        {{ t.label }}<span v-if="t.key === 'received' && pending" class="count">{{ pending }}</span>
      </button>
    </div>

    <template v-if="tab === 'requests'">
      <Spinner v-if="requests === null" />
      <div v-else-if="requests.length === 0" class="card empty">
        <strong>Aucune demande</strong>
        <RouterLink to="/requests/new" class="btn">Demander un montant</RouterLink>
      </div>
      <ul v-else class="list">
        <li v-for="r in requests" :key="r.id">
          <RouterLink :to="`/requests/${r.code}`" class="card row-between">
            <span>
              <strong>{{ r.note || 'Demande' }}</strong>
              <span class="muted small block">{{ formatDate(r.created_at) }}{{ r.payer_name ? ` · ${r.payer_name}` : '' }}</span>
            </span>
            <span class="right">
              <strong>{{ formatAmount(r.amount) }}</strong>
              <StatusPill :request="r" />
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>

    <template v-else-if="tab === 'received'">
      <Spinner v-if="payments === null" />
      <p v-else-if="payments.received.length === 0" class="muted center">Aucun paiement reçu pour l'instant.</p>
      <ul v-else class="list">
        <li v-for="p in payments.received" :key="p.id" class="card">
          <div class="row-between">
            <span>
              <strong>{{ p.payer_name }}</strong>
              <span class="muted small block">
                {{ formatDate(p.created_at) }}{{ p.note ? ` · ${p.note}` : '' }}{{ p.provider_id ? ` · via ${getProvider(p.provider_id).name}` : '' }}
              </span>
            </span>
            <span class="right">
              <strong>+{{ formatAmount(p.amount) }}</strong>
              <PaymentStatus :payment="p" />
            </span>
          </div>
          <template v-if="p.status === 'declared'">
            <p class="small muted">Vérifie sur ton Wave, Orange Money ou ta banque que l'argent est bien arrivé.</p>
            <div class="grid2">
              <button type="button" class="btn" @click="setStatus(p, 'confirmed')">Bien reçu</button>
              <button type="button" class="btn secondary" @click="setStatus(p, 'rejected')">Pas reçu</button>
            </div>
          </template>
        </li>
      </ul>
    </template>

    <template v-else>
      <Spinner v-if="payments === null" />
      <div v-else-if="payments.sent.length === 0" class="card empty">
        <strong>Aucun paiement envoyé</strong>
        <RouterLink to="/send" class="btn">Envoyer à un @pseudo</RouterLink>
      </div>
      <ul v-else class="list">
        <li v-for="p in payments.sent" :key="p.id" class="card row-between">
          <span>
            <strong>@{{ p.recipient_username }}</strong>
            <span class="muted small block">{{ formatDate(p.created_at) }}{{ p.note ? ` · ${p.note}` : '' }}</span>
          </span>
          <span class="right">
            <strong>-{{ formatAmount(p.amount) }}</strong>
            <PaymentStatus :payment="p" />
          </span>
        </li>
      </ul>
    </template>
  </main>
  <BottomNav active="activity" />
</template>
