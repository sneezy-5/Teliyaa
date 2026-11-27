<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../lib/api';
import { FEATURES } from '../lib/features';
import { formatAmount, formatPhone } from '../lib/format';
import { aliasDisplayName, getProvider, isPayerApp, PAYER_APPS } from '../lib/providers';
import { aliasFor, payMessage, preferredApp, quickPay, rememberApp } from '../lib/quickPay';
import { toast } from '../lib/toast';
import type { PublicAlias, PublicProfile } from '../lib/types';
import AliasCard from './AliasCard.vue';
import ErrorText from './ErrorText.vue';
import Icon from './Icon.vue';

/**
 * Payer en un geste : sous chaque compte, les apps (Wave, Orange Money…). Un toucher copie l'alias de ce compte et ouvre l'app.
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

/** App habituelle du payeur : mise en avant sur chaque compte */
const myApp = ref<string | null>(isPayerApp(props.favoriteProvider) ? props.favoriteProvider! : preferredApp());
const usedProvider = ref<string | null>(props.sentWith ?? null);
const usedAlias = ref<PublicAlias | null>(props.sentWith ? aliasFor(props.profile.aliases, props.sentWith) : null);
// « Tu as payé ? » seulement si les déclarations de paiement sont activées (désactivées en v1)
const awaiting = ref(FEATURES.paymentDeclarations && Boolean(props.sentWith));
const payerName = ref('');
const freeAmount = ref('');
const busy = ref(false);
const done = ref(false);
const error = ref<string | null>(null);

const firstName = computed(() => props.profile.full_name.split(' ')[0]);
const showValue = (a: PublicAlias) => (a.alias_type === 'phone' ? formatPhone(a.value) : a.value);

/**
 * Les apps proposées sous chaque compte, toujours dans le même ordre (Wave, Orange Money, MTN, Moov).
 * PI-SPI relie les opérateurs : on peut payer un compte Wave depuis Orange Money.
 */
const apps = PAYER_APPS;

/** Toucher une app sous un compte : l'alias de CE compte est copié et CETTE app s'ouvre */
async function payWith(providerId: string, alias: PublicAlias | null = usedAlias.value ?? aliasFor(props.profile.aliases, providerId)) {
  if (!alias) return;
  rememberApp(providerId);
  myApp.value = providerId;
  usedProvider.value = providerId;
  usedAlias.value = alias;
  awaiting.value = FEATURES.paymentDeclarations;
  const { result, copied } = await quickPay(alias, providerId);
  const message = payMessage(result, copied, getProvider(providerId).name);
  if (message) toast(message);
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
        Alias copié : <strong>{{ aliasDisplayName(usedAlias) }} · {{ showValue(usedAlias) }}</strong>. Colle-le dans ton app, entre
        {{ amount ? formatAmount(amount) : 'le montant' }} et valide.
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

      <div class="note warn">
        <Icon name="alert" />
        <span>
          Avant de valider, regarde le <strong>nom du titulaire</strong> affiché par ton app. Si ce n'est pas la personne que tu veux payer,
          n'envoie pas. Teliyaa ne vérifie pas les noms.
        </span>
      </div>

      <div class="section-head"><h2>Comptes de {{ firstName }}</h2></div>
      <p class="muted small" style="margin-top: -8px">Sous le compte choisi, touche ton app : l'alias est copié et l'app s'ouvre. Il ne reste qu'à coller et valider.</p>
      <ul class="acct-list">
        <li v-for="a in profile.aliases" :key="a.id">
          <AliasCard :alias="a" :apps="apps" :highlight-app="myApp" @pay-with="(id) => payWith(id, a)" />
        </li>
      </ul>
    </template>
  </div>
</template>
