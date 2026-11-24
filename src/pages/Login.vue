<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ErrorText from '../components/ErrorText.vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api';
import { DEMO_OTP } from '../lib/api/demo';
import { COUNTRIES, formatPhone, toE164 } from '../lib/format';
import { session, signedIn } from '../lib/session';

/** Canal du code : WhatsApp avec ton serveur (sauf VITE_OTP_CHANNEL=sms), SMS en mode démo */
const channel = import.meta.env.VITE_OTP_CHANNEL === 'sms' ? 'par SMS' : api.mode === 'server' ? 'par WhatsApp' : 'par SMS';

const route = useRoute();
const router = useRouter();
const next = (route.query.next as string) || '/';

const country = ref<string>(COUNTRIES[0].code);
const local = ref('');
const phone = ref<string | null>(null);
const code = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function send() {
  const e164 = toE164(country.value, local.value);
  if (!e164) return (error.value = `Le numéro doit avoir ${COUNTRIES.find((c) => c.code === country.value)?.digits} chiffres.`);
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
  if (!phone.value) return;
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

function changeNumber() {
  phone.value = null;
  code.value = '';
}
</script>

<template>
  <main v-if="phone" class="page">
    <TopBar title="Code de vérification" back="/login" />
    <form class="stack" @submit.prevent="verify">
      <p class="muted">Entre le code reçu {{ channel }} au {{ formatPhone(phone) }}.</p>
      <label class="field">
        <span>Code à 6 chiffres</span>
        <input
          class="otp"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          :value="code"
          autofocus
          @input="code = ($event.target as HTMLInputElement).value.replace(/\D/g, '')"
        />
      </label>
      <p v-if="api.mode === 'demo'" class="demo-banner dark">Mode démo : le code est {{ DEMO_OTP }}</p>
      <ErrorText :message="error" />
      <button class="btn" :disabled="busy || code.length < 6">{{ busy ? 'Vérification…' : 'Valider' }}</button>
      <button type="button" class="btn ghost" @click="changeNumber">Changer de numéro</button>
    </form>
  </main>

  <main v-else class="page">
    <TopBar title="Connexion" back="/" />
    <form class="stack" @submit.prevent="send">
      <p class="muted">Ton numéro sert à te connecter. Pas de mot de passe : on t'envoie un code {{ channel }}.</p>
      <div class="phone-row">
        <label class="field">
          <span>Pays</span>
          <select v-model="country">
            <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">{{ c.name }} ({{ c.code }})</option>
          </select>
        </label>
        <label class="field grow">
          <span>Numéro</span>
          <input v-model="local" inputmode="tel" autocomplete="tel-national" placeholder="07 00 00 00 01" autofocus />
        </label>
      </div>
      <ErrorText :message="error" />
      <button class="btn" :disabled="busy">{{ busy ? 'Envoi du code…' : `Recevoir le code ${channel}` }}</button>
    </form>
  </main>
</template>
