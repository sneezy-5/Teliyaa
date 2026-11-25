<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ErrorText from '../components/ErrorText.vue';
import Icon from '../components/Icon.vue';
import { api } from '../lib/api';
import { DEMO_OTP } from '../lib/api/demo';
import { COUNTRIES, formatPhone, toE164 } from '../lib/format';
import { session, signedIn } from '../lib/session';

/** Connexion = création de compte : numéro, puis code reçu par WhatsApp (SMS en mode démo). */
const channel = import.meta.env.VITE_OTP_CHANNEL === 'sms' || api.mode !== 'server' ? 'SMS' : 'WhatsApp';

const route = useRoute();
const router = useRouter();
const next = (route.query.next as string) || '/';

const country = ref<string>(COUNTRIES[0].code);
const current = computed(() => COUNTRIES.find((c) => c.code === country.value) ?? COUNTRIES[0]);
const local = ref('');
const phone = ref<string | null>(null);
const code = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function send() {
  const e164 = toE164(country.value, local.value);
  if (!e164) return (error.value = `Le numéro doit avoir ${current.value.digits} chiffres.`);
  busy.value = true;
  error.value = null;
  try {
    await api.sendOtp(e164);
    phone.value = e164;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function verify() {
  if (!phone.value || code.value.length < 6) return;
  busy.value = true;
  error.value = null;
  try {
    const user = await api.verifyOtp(phone.value, code.value);
    await signedIn(user);
    await router.replace(session.profile ? next : { path: '/onboarding', query: { next } });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function onCode(e: Event) {
  code.value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
  // Valide tout seul dès que les 6 chiffres sont là
  if (code.value.length === 6) void verify();
}

function changeNumber() {
  phone.value = null;
  code.value = '';
  error.value = null;
}
</script>

<template>
  <!-- Étape 2 : le code -->
  <main v-if="phone" class="page auth">
    <button type="button" class="icon-btn auth-back" aria-label="Retour" @click="changeNumber"><Icon name="back" :size="24" /></button>
    <form class="auth-form" @submit.prevent="verify">
      <h1>Entre le code</h1>
      <p class="muted">
        Envoyé par {{ channel }} au <strong class="nowrap">{{ formatPhone(phone) }}</strong>
      </p>
      <input
        class="auth-otp"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        placeholder="••••••"
        aria-label="Code à 6 chiffres"
        :value="code"
        autofocus
        @input="onCode"
      />
      <p v-if="api.mode === 'demo'" class="muted small">Démo : {{ DEMO_OTP }}</p>
      <ErrorText :message="error" />
      <button class="btn" :disabled="busy || code.length < 6">{{ busy ? 'Vérification…' : 'Valider' }}</button>
      <button type="button" class="link-btn center" @click="changeNumber">Changer de numéro</button>
    </form>
  </main>

  <!-- Étape 1 : le numéro -->
  <main v-else class="page auth">
    <RouterLink to="/" class="icon-btn auth-back" aria-label="Retour"><Icon name="back" :size="24" /></RouterLink>
    <form class="auth-form" @submit.prevent="send">
      <h1>Ton numéro</h1>
      <p class="muted">On t'envoie un code par {{ channel }}.</p>

      <div class="phone-field">
        <!-- Le menu natif est invisible par-dessus : on n'affiche que le drapeau et l'indicatif -->
        <label class="phone-country">
          <span aria-hidden="true">{{ current.flag }} {{ current.code }}</span>
          <Icon name="chevron" :size="14" class="phone-caret" />
          <select v-model="country" aria-label="Pays">
            <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">{{ c.flag }} {{ c.name }} ({{ c.code }})</option>
          </select>
        </label>
        <input v-model="local" inputmode="tel" autocomplete="tel-national" placeholder="07 00 00 00 01" aria-label="Numéro de téléphone" autofocus />
      </div>

      <ErrorText :message="error" />
      <button class="btn" :disabled="busy || !local.trim()">{{ busy ? 'Envoi…' : 'Recevoir le code' }}</button>
    </form>
  </main>
</template>
