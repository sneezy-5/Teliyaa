<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../lib/api';
import { FEATURES } from '../lib/features';
import { formatAmount, formatPhone } from '../lib/format';
import { copyText } from '../lib/links';
import { aliasDisplayName, getProvider, PROVIDERS } from '../lib/providers';
import { aliasFor, preferredApp, quickPay, rememberApp } from '../lib/quickPay';
import { toast } from '../lib/toast';
import type { PublicAlias, PublicProfile } from '../lib/types';
import ErrorText from './ErrorText.vue';
import Icon from './Icon.vue';
import ProviderBadge from './ProviderBadge.vue';

/**
 * Payer en un geste : un toucher sur « Payer avec Wave » copie l'alias du destinataire et ouvre l'app.
 * Au retour, on demande « Tu as payé ? » pour prévenir le destinataire.
 */
const props = defineProps<{
  profile: PublicProfile;
  /** Montant demandé (null = le payeur le choisit dans son app) */
  amount: number | null;
  note: string;
  requestCode?: string;
  /** App favorite du payeur connecté (sinon celle retenue sur ce téléphone) */
  favoriteProvider?: string | null;
  /** Payeur connecté : pas besoin de demander son nom */
  loggedIn: boolean;
  /** L'app a déjà été ouverte depuis la liste de contacts : on attend la confirmation */
  sentWith?: string | null;
}>();
const emit = defineEmits<{ declared: [] }>();

const myApp = ref<string | null>(props.favoriteProvider || preferredApp());
const choosing = ref(false);
const usedProvider = ref<string | null>(props.sentWith ?? null);
const usedAlias = ref<PublicAlias | null>(props.sentWith ? aliasFor(props.profile.aliases, props.sentWith) : null);
// « Tu as payé ? » seulement si les déclarations de paiement sont activées (désactivées en v1)
const awaiting = ref(FEATURES.paymentDeclarations && Boolean(props.sentWith));
const payerName = ref('');
const freeAmount = ref('');
const busy = ref(false);
const done = ref(false);
const error = ref<string | null>(null);

const apps = PROVIDERS.filter((p) => p.id !== 'other');
const firstName = computed(() => props.profile.full_name.split(' ')[0]);
const showValue = (a: PublicAlias) => (a.alias_type === 'phone' ? formatPhone(a.value) : a.value);

async function copy(alias: PublicAlias) {
  const ok = await copyText(alias.value);
  toast(ok ? 'Alias copié' : 'Copie impossible, recopie-le à la main');
}

async function payWith(providerId: string) {
  const alias = aliasFor(props.profile.aliases, providerId);
  if (!alias) return;
  rememberApp(providerId);
  myApp.value = providerId;
  choosing.value = false;
  usedProvider.value = providerId;
  usedAlias.value = alias;
  awaiting.value = FEATURES.paymentDeclarations;
  const { result, copied } = await quickPay(alias, providerId);
  const name = getProvider(providerId).name;
  if (result === 'unsupported') toast(copied ? `Alias copié. Ouvre ${name} et colle-le.` : `Ouvre ${name} et envoie à ${showValue(alias)}.`);
}

async function declare() {
  const value = props.amount ?? Number(freeAmount.value.replace(/\D/g, ''));
  if (!value || value <= 0) return (error.value = 'Indique le montant que tu as envoyé.');
  if (!props.loggedIn && payerName.value.trim().length < 2) return (error.value = 'Indique ton nom pour que la personne te reconnaisse.');
  busy.value = true;
  error.value = null;
  try {
    await api.declarePayment({
      recipientUsername: props.profile.username,
      amount: value,
      note: props.note,
      requestCode: props.requestCode ?? null,
      providerId: usedProvider.value,
      payerName: props.loggedIn ? undefined : payerName.value
    });
    done.value = true;
    emit('declared');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="done" class="card success">
    <span class="big-check" aria-hidden="true"><Icon name="check" :size="34" /></span>
    <h2>C'est noté</h2>
    <p class="muted center">{{ firstName }} est prévenu·e et confirmera dès qu'il·elle verra l'argent sur son compte.</p>
  </div>

  <div v-else class="stack">
    <p v-if="profile.aliases.length === 0" class="note">{{ firstName }} n'a pas encore ajouté de compte.</p>

    <template v-else>
      <!-- v1 : simple rappel de ce qui a été copié -->
      <p v-if="!FEATURES.paymentDeclarations && usedAlias" class="note ok" role="status">
        Alias copié : <strong>{{ aliasDisplayName(usedAlias) }} · {{ showValue(usedAlias) }}</strong>. Colle-le dans ton app, entre le montant et valide.
      </p>

      <!-- Retour de l'app : on demande si c'est fait -->
      <div v-if="awaiting" class="card declare">
        <h2>Tu as payé {{ firstName }} ?</h2>
        <p v-if="usedAlias" class="muted small">
          Alias copié : <strong>{{ aliasDisplayName(usedAlias) }} · {{ showValue(usedAlias) }}</strong>. Colle-le dans ton app, entre le montant et valide.
        </p>
        <label v-if="amount === null" class="field">
          <span>Montant envoyé (FCFA)</span>
          <input v-model="freeAmount" inputmode="numeric" placeholder="15 000" />
        </label>
        <label v-if="!loggedIn" class="field">
          <span>Ton nom</span>
          <input v-model="payerName" placeholder="ex. Koffi A." autocomplete="name" />
        </label>
        <ErrorText :message="error" />
        <button type="button" class="btn" :disabled="busy" @click="declare">
          {{ busy ? 'Envoi…' : amount ? `Oui, j'ai payé ${formatAmount(amount)}` : "Oui, j'ai payé" }}
        </button>
        <button v-if="usedProvider" type="button" class="btn secondary" @click="payWith(usedProvider)">Rouvrir {{ getProvider(usedProvider).name }}</button>
        <button type="button" class="btn ghost" @click="awaiting = false">Pas encore</button>
      </div>

      <!-- Un seul bouton quand on connaît mon app -->
      <template v-else-if="myApp && !choosing">
        <button type="button" class="btn big" @click="payWith(myApp)">
          <ProviderBadge :provider-id="myApp" /> Payer avec {{ getProvider(myApp).name }}
        </button>
        <button type="button" class="link-btn center" @click="choosing = true">Payer avec une autre app</button>
      </template>

      <!-- Première fois : je choisis mon app (retenue ensuite) -->
      <template v-else>
        <h2>Payer avec…</h2>
        <div class="app-grid">
          <button v-for="p in apps" :key="p.id" type="button" class="app-tile" @click="payWith(p.id)">
            <ProviderBadge :provider-id="p.id" />
            <span>{{ p.name }}</span>
          </button>
        </div>
        <p class="muted small">L'alias de {{ firstName }} est copié et ton app s'ouvre. Ton choix est retenu pour la prochaine fois.</p>
      </template>

      <div class="note warn">
        <Icon name="alert" />
        <span>Avant de valider, vérifie que ton app affiche bien le nom <strong>{{ profile.full_name.toUpperCase() }}</strong>. Sinon, n'envoie pas.</span>
      </div>

      <div class="section-head"><h2>Comptes de {{ firstName }}</h2></div>
      <ul class="list">
        <li v-for="a in profile.aliases" :key="a.id" class="card alias">
          <ProviderBadge :provider-id="a.provider_id" :label="a.label" />
          <span class="grow">
            <strong>{{ aliasDisplayName(a) }}</strong>
            <span v-if="a.is_primary" class="pill ok" style="margin-left: 8px">Principal</span>
            <span class="muted small block mono">{{ showValue(a) }}</span>
          </span>
          <button type="button" class="link-btn" :aria-label="`Copier ${aliasDisplayName(a)}`" @click="copy(a)"><Icon name="copy" :size="18" /></button>
        </li>
      </ul>
    </template>
  </div>
</template>
