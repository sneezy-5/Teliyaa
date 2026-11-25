<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ErrorText from '../components/ErrorText.vue';
import Icon from '../components/Icon.vue';
import { api } from '../lib/api';
import { normalizeUsername, validateUsername } from '../lib/format';
import { refreshProfile, session } from '../lib/session';

/** Création (ou modification) du profil : nom affiché + @pseudo unique. */
const router = useRouter();
const editing = Boolean(session.profile);
const fullName = ref(session.profile?.full_name ?? '');
const username = ref(session.profile?.username ?? '');
const available = ref<boolean | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const u = computed(() => normalizeUsername(username.value));
const formatError = computed(() => (u.value ? validateUsername(u.value) : null));

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  u,
  (value) => {
    available.value = null;
    clearTimeout(timer);
    if (!value || formatError.value) return;
    timer = setTimeout(() => {
      api.isUsernameAvailable(value).then((ok) => (available.value = ok)).catch(() => (available.value = null));
    }, 350);
  },
  { immediate: true }
);

const hint = computed(() => {
  if (formatError.value) return { text: formatError.value, cls: 'error' };
  if (available.value === false) return { text: 'Déjà pris.', cls: 'error' };
  if (available.value) return { text: 'Disponible', cls: 'ok-text' };
  return null;
});

async function submit() {
  if (fullName.value.trim().length < 2) return (error.value = 'Indique ton nom.');
  const err = validateUsername(u.value);
  if (err) return (error.value = err);
  busy.value = true;
  error.value = null;
  try {
    await api.saveMyProfile({ full_name: fullName.value.trim(), username: u.value });
    await refreshProfile();
    await router.replace(editing ? '/profile' : '/aliases/new?first=1');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page auth">
    <RouterLink v-if="editing" to="/profile" class="icon-btn auth-back" aria-label="Retour"><Icon name="back" :size="24" /></RouterLink>
    <div v-else style="height: 44px" />
    <form class="auth-form" @submit.prevent="submit">
      <h1>{{ editing ? 'Nom et pseudo' : 'Qui es-tu ?' }}</h1>
      <p class="muted">Affichés sur ta page de paiement.</p>
      <label class="field">
        <span>Nom complet</span>
        <input v-model="fullName" autocomplete="name" placeholder="Mariam Sanogo" />
      </label>
      <label class="field">
        <span>Pseudo</span>
        <div class="prefix-input">
          <span aria-hidden="true">@</span>
          <input v-model="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="mariam.s" />
        </div>
        <small v-if="hint" :class="hint.cls">{{ hint.text }}</small>
      </label>
      <ErrorText :message="error" />
      <button class="btn" :disabled="busy || available === false">{{ busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Continuer' }}</button>
    </form>
  </main>
</template>
