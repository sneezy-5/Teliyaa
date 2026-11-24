<script setup lang="ts">
import QRCode from 'qrcode';
import { computed, onMounted, ref, watchEffect } from 'vue';
import BottomNav from '../components/BottomNav.vue';
import Icon from '../components/Icon.vue';
import ProviderBadge from '../components/ProviderBadge.vue';
import Spinner from '../components/Spinner.vue';
import { api } from '../lib/api';
import { FEATURES } from '../lib/features';
import { formatAmount, formatPhone } from '../lib/format';
import { copyText, prettyLink, profileLink, shareText } from '../lib/links';
import { aliasDisplayName } from '../lib/providers';
import { session } from '../lib/session';
import { toast } from '../lib/toast';
import type { Alias, Payment } from '../lib/types';

/**
 * Accueil : mon QR au centre (le plus rapide pour se faire payer), mon nom et mon lien,
 * une rangée d'actions rondes, puis mes comptes.
 */
const aliases = ref<Alias[] | null>(null);
const toConfirm = ref<Payment[]>([]);
const qr = ref<string | null>(null);
const profile = computed(() => session.profile);
const link = computed(() => profileLink(profile.value?.username ?? ''));

watchEffect(async (onCleanup) => {
  let alive = true;
  onCleanup(() => (alive = false));
  if (!profile.value) return;
  try {
    const url = await QRCode.toDataURL(link.value, { margin: 1, width: 480, color: { dark: '#111827', light: '#FFFFFF' } });
    if (alive) qr.value = url;
  } catch {
    if (alive) qr.value = null;
  }
});

onMounted(() => {
  api.listMyAliases().then((list) => (aliases.value = list)).catch(() => (aliases.value = []));
  if (FEATURES.paymentDeclarations) {
    api.listMyPayments().then((p) => (toConfirm.value = p.received.filter((x) => x.status === 'declared'))).catch(() => {});
  }
});

const share = () => shareText('Pour me payer (Wave, Orange Money, banque…) :', link.value);
const copyLink = async () => toast((await copyText(link.value)) ? 'Lien copié' : 'Copie impossible');
</script>

<template>
  <main v-if="profile" class="page with-nav">
    <!-- Pas d'en-tête : la zone du QR commence en haut de l'écran, réglages discrets à droite -->
    <section class="home-qr" aria-label="Mon QR de paiement">
      <RouterLink to="/profile" class="icon-btn home-settings" aria-label="Réglages"><Icon name="settings" :size="22" /></RouterLink>
      <div class="qr-tile">
        <img v-if="qr" :src="qr" :alt="`QR code de paiement de ${profile.full_name}`" width="190" height="190" />
        <div v-else class="qr-placeholder" />
      </div>
      <strong class="home-name">{{ profile.full_name }}</strong>
      <button type="button" class="home-link" aria-label="Copier mon lien" @click="copyLink">
        {{ prettyLink(link) }} <Icon name="copy" :size="16" />
      </button>
      <span class="muted small">Scanne ce code pour me payer avec n'importe quelle app</span>
    </section>

    <nav :class="['quick-actions', { four: FEATURES.paymentRequests }]" aria-label="Actions rapides">
      <RouterLink to="/send" class="quick">
        <span class="quick-ico"><Icon name="send" :size="24" /></span> Envoyer
      </RouterLink>
      <RouterLink v-if="FEATURES.paymentRequests" to="/requests/new" class="quick">
        <span class="quick-ico"><Icon name="receive" :size="24" /></span> Demander
      </RouterLink>
      <button type="button" class="quick" @click="share">
        <span class="quick-ico"><Icon name="share" :size="24" /></span> Partager
      </button>
      <a v-if="qr" :href="qr" :download="`${profile.username}-qr.png`" class="quick">
        <span class="quick-ico"><Icon name="qr" :size="24" /></span> Enregistrer
      </a>
    </nav>

    <RouterLink v-if="FEATURES.paymentDeclarations && toConfirm.length" to="/activity?tab=received" class="note info">
      <Icon name="alert" />
      <span>
        <strong>{{ toConfirm.length }} paiement{{ toConfirm.length > 1 ? 's' : '' }} à confirmer</strong> — dont {{ formatAmount(toConfirm[0].amount) }} de
        {{ toConfirm[0].payer_name }}. Vérifie ton compte puis confirme.
      </span>
    </RouterLink>

    <div class="section-head">
      <h2>Mes comptes</h2>
    </div>
    <!-- Bien visible, avant la liste -->
    <RouterLink v-if="aliases && aliases.length" to="/aliases/new" class="btn"><Icon name="plus" :size="20" /> Ajouter un compte</RouterLink>

    <Spinner v-if="aliases === null" />
    <div v-else-if="aliases.length === 0" class="card empty">
      <strong>Aucun compte pour l'instant</strong>
      <p class="muted small">Ajoute l'alias PI-SPI de ton Wave, Orange Money, MTN, Moov ou de ta banque.</p>
      <RouterLink to="/aliases/new" class="btn">+ Ajouter un compte</RouterLink>
    </div>
    <ul v-else class="list">
      <li v-for="a in aliases" :key="a.id">
        <RouterLink :to="`/aliases/${a.id}`" class="card alias">
          <ProviderBadge :provider-id="a.provider_id" :label="a.label" />
          <span class="grow">
            <strong>{{ aliasDisplayName(a) }}</strong>
            <span v-if="a.is_primary" class="pill ok" style="margin-left: 8px">Principal</span>
            <span v-if="!a.visible" class="pill" style="margin-left: 8px">Masqué</span>
            <span class="muted small block mono">{{ a.alias_type === 'phone' ? formatPhone(a.value) : a.value }}</span>
          </span>
          <Icon name="chevron" :size="18" class="muted" />
        </RouterLink>
      </li>
    </ul>
  </main>
  <BottomNav active="home" />
</template>
