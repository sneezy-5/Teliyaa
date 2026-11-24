<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ErrorText from '../components/ErrorText.vue';
import Spinner from '../components/Spinner.vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api';
import { formatAmount, parseAmount } from '../lib/format';
import { aliasDisplayName } from '../lib/providers';
import type { Alias } from '../lib/types';

const router = useRouter();
const aliases = ref<Alias[] | null>(null);
const selected = ref<string[]>([]);
const amount = ref('');
const note = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const value = computed(() => parseAmount(amount.value));

onMounted(async () => {
  const visible = (await api.listMyAliases()).filter((a) => a.visible);
  aliases.value = visible;
  selected.value = visible.map((a) => a.id);
});

async function submit() {
  if (!value.value) return (error.value = 'Indique un montant.');
  if (selected.value.length === 0) return (error.value = 'Choisis au moins un compte.');
  busy.value = true;
  error.value = null;
  try {
    const req = await api.createRequest({ amount: value.value, note: note.value.trim(), alias_ids: selected.value });
    await router.replace(`/requests/${req.code}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Spinner v-if="aliases === null" />
  <main v-else class="page">
    <TopBar title="Demander un montant" back="/" />
    <div v-if="aliases.length === 0" class="card empty">
      <strong>Ajoute d'abord un compte</strong>
      <p class="muted small">Il faut au moins un alias visible pour que la personne puisse te payer.</p>
      <RouterLink to="/aliases/new" class="btn">+ Ajouter un compte</RouterLink>
    </div>
    <form v-else class="stack" @submit.prevent="submit">
      <label class="card amount-card">
        <span class="muted">Montant</span>
        <span class="amount-input">
          <input v-model="amount" inputmode="numeric" placeholder="0" autofocus aria-label="Montant en FCFA" />
          <span>FCFA</span>
        </span>
        <small v-if="value" class="muted">{{ formatAmount(value) }}</small>
      </label>

      <label class="field">
        <span>Motif</span>
        <input v-model="note" maxlength="80" placeholder="ex. Cotisation tontine — novembre" />
      </label>

      <fieldset class="field">
        <legend>Comptes proposés</legend>
        <label v-for="a in aliases" :key="a.id" class="check card">
          <input v-model="selected" type="checkbox" :value="a.id" />
          {{ aliasDisplayName(a) }}<span v-if="a.is_primary" class="muted small">&nbsp;· principal</span>
        </label>
      </fieldset>

      <ErrorText :message="error" />
      <button class="btn" :disabled="busy">{{ busy ? 'Création…' : 'Créer le lien' }}</button>
    </form>
  </main>
</template>
