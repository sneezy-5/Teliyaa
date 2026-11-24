<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BankBadge from '../components/BankBadge.vue';
import ErrorText from '../components/ErrorText.vue';
import Icon from '../components/Icon.vue';
import ProviderBadge from '../components/ProviderBadge.vue';
import Spinner from '../components/Spinner.vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api';
import { parseAliasInput } from '../lib/aliasInput';
import { BANKS_CI, isKnownBank } from '../lib/banks';
import { countryCodeOf } from '../lib/contacts';
import { formatPhone } from '../lib/format';
import { getProvider, PROVIDERS } from '../lib/providers';
import { session } from '../lib/session';
import type { Alias } from '../lib/types';

/**
 * Ajouter un compte en 2 étapes :
 * 1. Où est ce compte ? (une tuile)
 * 2. Ton alias (un seul champ : numéro ou adresse, reconnu automatiquement)
 * Le reste (nom affiché, principal, visible) est dans « Plus d'options ».
 */
const route = useRoute();
const router = useRouter();
const id = route.params.id as string | undefined;
const first = route.query.first === '1';

const loading = ref(Boolean(id));
const existing = ref<Alias | null>(null);
const step = ref<1 | 2>(id ? 2 : 1);
const providerId = ref('wave');
const aliasText = ref('');
const label = ref('');
const primary = ref(first);
const visible = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);
const confirmDelete = ref(false);
const showOptions = ref(false);
/** Banque choisie dans la liste, ou OTHER_BANK + nom saisi à la main */
const OTHER_BANK = '__autre__';
const bank = ref('');
const otherBank = ref('');

const provider = computed(() => getProvider(providerId.value));
const isBank = computed(() => providerId.value === 'bank');
const bankName = computed(() => (bank.value === OTHER_BANK ? otherBank.value.trim() : bank.value));
const pickingBank = ref(false);
const bankQuery = ref('');
const filteredBanks = computed(() => {
  const q = bankQuery.value.trim().toLowerCase();
  return q ? BANKS_CI.filter((b) => b.name.toLowerCase().includes(q) || b.short.toLowerCase().includes(q)) : BANKS_CI;
});
function pickBank(name: string) {
  bank.value = name;
  pickingBank.value = false;
  bankQuery.value = '';
  error.value = null;
}
const myPhone = session.user?.phone ?? '';
const myCode = countryCodeOf(myPhone);
const appName = computed(() => {
  if (isBank.value) return bankName.value || 'de ta banque';
  return provider.value.kind === 'bank' ? 'de ta banque' : provider.value.name;
});

onMounted(async () => {
  if (!id) return;
  const a = (await api.listMyAliases()).find((x) => x.id === id) ?? null;
  existing.value = a;
  if (a) {
    providerId.value = a.provider_id;
    aliasText.value = a.alias_type === 'phone' ? formatPhone(a.value) : a.value;
    label.value = a.label ?? '';
    if (a.provider_id === 'bank' && a.label) {
      if (isKnownBank(a.label)) {
        bank.value = a.label;
      } else {
        bank.value = OTHER_BANK;
        otherBank.value = a.label;
      }
    }
    primary.value = a.is_primary;
    visible.value = a.visible;
  }
  loading.value = false;
});

function chooseProvider(pid: string) {
  providerId.value = pid;
  error.value = null;
  step.value = 2;
}

async function submit() {
  if (isBank.value && !bankName.value) return (error.value = 'Choisis ta banque.');
  const parsed = parseAliasInput(aliasText.value, myCode);
  if (!parsed.ok) return (error.value = parsed.error);
  // Pour une banque, le libellé affiché est le nom de la banque
  const finalLabel = isBank.value ? bankName.value.slice(0, 40) : label.value.trim() || null;
  busy.value = true;
  error.value = null;
  try {
    await api.saveAlias({
      id: existing.value?.id,
      provider_id: providerId.value,
      alias_type: parsed.type,
      value: parsed.value,
      label: finalLabel,
      is_primary: primary.value,
      visible: visible.value
    });
    await router.replace('/');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!existing.value) return;
  await api.deleteAlias(existing.value.id);
  await router.replace('/');
}
</script>

<template>
  <Spinner v-if="loading" />
  <main v-else class="page">
    <TopBar :title="existing ? 'Modifier le compte' : 'Ajouter un compte'" :back="first ? undefined : '/'" />

    <!-- Étape 1 : où est ce compte ? -->
    <section v-if="step === 1" class="stack">
      <p class="muted small">Étape 1 sur 2</p>
      <h2 class="h1">Où est ce compte ?</h2>
      <div class="app-grid">
        <button v-for="p in PROVIDERS" :key="p.id" type="button" class="app-tile" @click="chooseProvider(p.id)">
          <ProviderBadge :provider-id="p.id" />
          <span>{{ p.name }}</span>
        </button>
      </div>
      <button v-if="first" type="button" class="btn ghost" @click="router.replace('/')">Plus tard</button>
    </section>

    <!-- Étape 2 : l'alias -->
    <form v-else class="stack" @submit.prevent="submit">
      <p v-if="!existing" class="muted small">Étape 2 sur 2</p>
      <button type="button" class="card alias choice" @click="step = 1">
        <ProviderBadge :provider-id="providerId" />
        <strong class="grow">{{ provider.name }}</strong>
        <span class="link-btn">Changer</span>
      </button>

      <template v-if="isBank">
        <!-- Banque choisie -->
        <button v-if="bank && !pickingBank" type="button" class="card alias choice" @click="pickingBank = true">
          <BankBadge :name="bankName || 'Autre'" />
          <strong class="grow">{{ bank === OTHER_BANK ? 'Autre banque' : bank }}</strong>
          <span class="link-btn">Changer</span>
        </button>
        <!-- Liste des banques avec recherche -->
        <div v-else class="stack">
          <span class="field-title">Ta banque</span>
          <label class="search">
            <Icon name="search" />
            <input v-model="bankQuery" placeholder="Rechercher ta banque" autocorrect="off" aria-label="Rechercher ta banque" />
          </label>
          <ul class="list bank-list">
            <li v-for="b in filteredBanks" :key="b.name">
              <button type="button" class="card alias" @click="pickBank(b.name)">
                <BankBadge :name="b.name" />
                <strong class="grow">{{ b.name }}</strong>
              </button>
            </li>
            <li>
              <button type="button" class="card alias" @click="pickBank(OTHER_BANK)">
                <span class="badge-ico" aria-hidden="true"><Icon name="plus" :size="18" /></span>
                <strong class="grow">Autre banque…</strong>
              </button>
            </li>
          </ul>
        </div>
        <label v-if="bank === OTHER_BANK" class="field">
          <span>Nom de ta banque</span>
          <input v-model="otherBank" maxlength="40" placeholder="ex. Baobab" />
        </label>
      </template>

      <label class="field">
        <span>Ton alias {{ appName }}</span>
        <input v-model="aliasText" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Ton alias PI-SPI" autofocus />
      </label>
      <button v-if="myPhone && !aliasText" type="button" class="link-btn" @click="aliasText = formatPhone(myPhone)">
        Utiliser mon numéro {{ formatPhone(myPhone) }}
      </button>
      <small class="muted">Tu le trouves dans l'app {{ appName }}, rubrique PI-SPI. C'est souvent ton numéro de téléphone.</small>

      <ErrorText :message="error" />
      <button class="btn" :disabled="busy || !aliasText.trim()">{{ busy ? 'Enregistrement…' : 'Enregistrer' }}</button>

      <button type="button" class="link-btn center" :aria-expanded="showOptions" @click="showOptions = !showOptions">
        {{ showOptions ? "Moins d'options" : "Plus d'options" }}
      </button>
      <div v-if="showOptions" class="stack">
        <label v-if="!isBank" class="field">
          <span>Nom affiché <span class="muted">(facultatif)</span></span>
          <input v-model="label" maxlength="40" placeholder="ex. Wave perso" />
        </label>
        <label class="check"><input v-model="primary" type="checkbox" /> Compte principal (proposé en premier)</label>
        <label class="check"><input v-model="visible" type="checkbox" /> Visible sur ma page de paiement</label>
      </div>

      <template v-if="existing">
        <button v-if="!confirmDelete" type="button" class="btn danger" @click="confirmDelete = true"><Icon name="trash" :size="18" /> Supprimer ce compte</button>
        <div v-else class="card stack">
          <strong>Supprimer ce compte de ta page ?</strong>
          <div class="grid2">
            <button type="button" class="btn secondary" @click="confirmDelete = false">Non</button>
            <button type="button" class="btn danger" @click="remove">Oui, supprimer</button>
          </div>
        </div>
      </template>
    </form>
  </main>
</template>
