<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ErrorText from '../components/ErrorText.vue';
import Icon from '../components/Icon.vue';
import { api } from '../lib/api';
import { DEMO_OTP } from '../lib/api/demo';
import type { OtpChannel } from '../lib/api/types';
import { COUNTRIES, formatPhone, toE164 } from '../lib/format';
import { session, signedIn } from '../lib/session';

/** Connexion = création de compte : numéro, puis code reçu par WhatsApp ou par SMS (au choix). */
const CHANNEL_NAMES: Record<OtpChannel, string> = { whatsapp: 'WhatsApp', sms: 'SMS' };
const channels = ref<OtpChannel[]>(['whatsapp']);
/** Canal utilisé pour le dernier code envoyé */
const channel = ref<OtpChannel>('whatsapp');
const otherChannel = computed(() => channels.value.find((c) => c !== channel.value) ?? null);
onMounted(async () => {
  channels.value = await api.otpChannels();
  channel.value = channels.value[0];
});

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

async function send(via: OtpChannel = channel.value) {
  const e164 = phone.value ?? toE164(country.value, local.value);
  if (!e164) return (error.value = `Le numéro doit avoir ${current.value.digits} chiffres.`);
  busy.value = true;
  error.value = null;
  try {
    await api.sendOtp(e164, via);
    channel.value = via;
    code.value = '';
    phone.value = e164;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** Recevoir le code par l'autre moyen (SMS si WhatsApp n'arrive pas, et inversement) */
function sendOther() {
  if (otherChannel.value) void send(otherChannel.value);
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
        Envoyé par {{ CHANNEL_NAMES[channel] }} au <strong class="nowrap">{{ formatPhone(phone) }}</strong>
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
      <button v-if="otherChannel" type="button" class="link-btn center" :disabled="busy" @click="sendOther">
        Pas reçu ? Recevoir le code par {{ CHANNEL_NAMES[otherChannel] }}
      </button>
      <button type="button" class="link-btn center" @click="changeNumber">Changer de numéro</button>
    </form>
  </main>

  <!-- Étape 1 : le numéro -->
  <main v-else class="page auth">
    <RouterLink to="/" class="icon-btn auth-back" aria-label="Retour"><Icon name="back" :size="24" /></RouterLink>
    <form class="auth-form" @submit.prevent="send()">
      <h1>Ton numéro</h1>
      <p class="muted">On t'envoie un code par {{ CHANNEL_NAMES[channel] }}.</p>

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
      <button class="btn" :disabled="busy || !local.trim()">{{ busy ? 'Envoi…' : `Recevoir le code par ${CHANNEL_NAMES[channel]}` }}</button>
      <button v-if="otherChannel" type="button" class="link-btn center" :disabled="busy || !local.trim()" @click="sendOther">
        Plutôt par {{ CHANNEL_NAMES[otherChannel] }}
      </button>
    </form>
  </main>
</template>
