<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api';
import {
  biometricAvailable,
  biometricEnabled,
  biometricVerify,
  isWeakPin,
  needsPin,
  PIN_LENGTH,
  pinState,
  resetRequested,
  setBiometricEnabled,
  setResetRequested
} from '../lib/pin';
import { markPinOk, session } from '../lib/session';
import { toast } from '../lib/toast';
import Icon from './Icon.vue';

/**
 * Écran du code PIN, par-dessus toute l'app (le serveur vérifie le code) :
 * - pas encore de code → on le crée (deux fois), puis on propose l'empreinte digitale
 * - app verrouillée → PIN, ou empreinte si activée sur ce téléphone
 * - « Changer mon code » (profil) → ancien code, puis nouveau
 * - code oublié → nouveau code juste après une connexion avec le code WhatsApp
 */
const route = useRoute();
const router = useRouter();
const logoUrl = `${import.meta.env.BASE_URL}icone-512.png`;

type Step = 'unlock' | 'current' | 'create' | 'confirm' | 'bio';
const step = ref<Step>('unlock');
const resetting = ref(false);
const entry = ref('');
const firstEntry = ref('');
const currentPin = ref('');
const message = ref<string | null>(null);
const shake = ref(false);
const busy = ref(false);
const forgotOpen = ref(false);
const bioReady = ref(false);

const uid = computed(() => session.user?.id ?? null);
const active = computed(() => needsPin(route.path) || step.value === 'bio');
/** L'empreinte ne rouvre que ce téléphone : il faut que le PIN ait déjà été tapé sur cette session */
const canUseBio = computed(() => bioReady.value && Boolean(uid.value && session.user?.pin_ok && biometricEnabled(uid.value)));

function reset() {
  entry.value = '';
  firstEntry.value = '';
  currentPin.value = '';
  message.value = null;
  forgotOpen.value = false;
}

// Étape de départ chaque fois que l'écran apparaît
watch(
  [() => needsPin(route.path), () => pinState.changing, uid],
  ([needed]) => {
    if (!needed || step.value === 'bio') return;
    reset();
    const user = session.user;
    resetting.value = Boolean(user?.has_pin && !user.pin_ok && resetRequested());
    if (!user?.has_pin || resetting.value) step.value = 'create';
    else if (pinState.changing && user.pin_ok && pinState.unlocked) step.value = 'current';
    else step.value = 'unlock';
    if (step.value === 'unlock' && canUseBio.value) void tryBiometric();
  },
  { immediate: true }
);

onMounted(async () => {
  bioReady.value = await biometricAvailable();
  if (step.value === 'unlock' && needsPin(route.path) && canUseBio.value) void tryBiometric();
});

const title = computed(
  () =>
    ({
      unlock: 'Entre ton code',
      current: 'Ton code actuel',
      create: pinState.changing || resetting.value ? 'Ton nouveau code' : 'Choisis ton code',
      confirm: 'Confirme ton code',
      bio: 'Ouvrir avec ton empreinte ?'
    })[step.value]
);
const subtitle = computed(() => {
  if (step.value === 'create') return `${PIN_LENGTH} chiffres, demandés à chaque ouverture de Teliyaa.`;
  if (step.value === 'confirm') return 'Tape-le une deuxième fois.';
  if (step.value === 'bio') return 'Plus besoin de taper ton code : ton empreinte ou ton visage suffit. Le code reste possible.';
  return session.profile ? `Bonjour ${session.profile.full_name.split(' ')[0]}` : '';
});

function fail(text: string) {
  message.value = text;
  shake.value = true;
  setTimeout(() => (shake.value = false), 400);
  entry.value = '';
}

/** Déverrouillé : on referme l'écran (ou on propose l'empreinte la première fois) */
async function unlocked(offerBio: boolean) {
  markPinOk();
  pinState.unlocked = true;
  pinState.changing = false;
  setResetRequested(false);
  reset();
  if (offerBio && uid.value && bioReady.value && !biometricEnabled(uid.value)) step.value = 'bio';
  else step.value = 'unlock';
}

/** Trop d'erreurs : le serveur a fermé la session */
async function sessionClosed(text: string) {
  pinState.changing = false;
  toast(text);
  await router.replace('/login');
}

async function complete(pin: string) {
  busy.value = true;
  try {
    if (step.value === 'unlock') {
      await api.verifyPin(pin);
      await unlocked(false);
    } else if (step.value === 'current') {
      currentPin.value = pin;
      entry.value = '';
      message.value = null;
      step.value = 'create';
    } else if (step.value === 'create') {
      if (isWeakPin(pin)) return fail('Code trop facile à deviner. Choisis-en un autre.');
      firstEntry.value = pin;
      entry.value = '';
      message.value = null;
      step.value = 'confirm';
    } else if (step.value === 'confirm') {
      if (pin !== firstEntry.value) {
        step.value = 'create';
        firstEntry.value = '';
        return fail('Les deux codes ne sont pas pareils. Recommence.');
      }
      const changing = pinState.changing;
      if (resetting.value) await api.resetPin(pin);
      else await api.setPin(pin, changing ? currentPin.value : undefined);
      toast(changing || resetting.value ? 'Code modifié' : 'Code enregistré');
      await unlocked(!changing);
    }
  } catch (e) {
    const text = (e as Error).message;
    if (!session.user) return sessionClosed(text); // 5 erreurs : déconnecté par le serveur
    if (resetting.value && /reconnecte-toi/i.test(text)) {
      // Plus assez récent pour « code oublié » : on repasse par le code WhatsApp
      return forgotViaWhatsApp();
    }
    if (step.value === 'confirm') step.value = pinState.changing ? 'current' : 'create';
    firstEntry.value = '';
    fail(text);
  } finally {
    busy.value = false;
  }
}

function press(digit: string) {
  if (busy.value || entry.value.length >= PIN_LENGTH) return;
  entry.value += digit;
  if (entry.value.length === PIN_LENGTH) void complete(entry.value);
}

const erase = () => (entry.value = entry.value.slice(0, -1));

async function tryBiometric() {
  if (busy.value) return;
  if (await biometricVerify()) await unlocked(false);
}

async function enableBio(on: boolean) {
  if (on && uid.value && (await biometricVerify())) {
    setBiometricEnabled(uid.value, true);
    toast('Empreinte activée');
  }
  step.value = 'unlock';
}

/** Code oublié */
async function forgot() {
  if (session.user && !session.user.pin_ok) {
    // On vient de se connecter avec le code WhatsApp : on peut choisir un nouveau code tout de suite
    setResetRequested(true);
    reset();
    resetting.value = true;
    step.value = 'create';
    return;
  }
  await forgotViaWhatsApp();
}

async function forgotViaWhatsApp() {
  setResetRequested(true);
  if (uid.value) setBiometricEnabled(uid.value, false);
  pinState.changing = false;
  await api.signOut();
  toast('Reconnecte-toi avec le code WhatsApp, puis choisis un nouveau code.');
  await router.replace('/login');
}

const cancelChange = () => (pinState.changing = false);

// Sur ordinateur : on peut taper le code au clavier
function onKey(e: KeyboardEvent) {
  if (!active.value || forgotOpen.value || step.value === 'bio') return;
  if (/^\d$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') erase();
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="active" class="pin-screen" role="dialog" aria-modal="true" :aria-label="title">
    <div class="pin-inner">
      <img :src="logoUrl" alt="" width="56" height="56" class="welcome-icon" />
      <h1 class="h1">{{ title }}</h1>
      <p v-if="subtitle" class="muted">{{ subtitle }}</p>

      <!-- Proposition de l'empreinte, juste après la création du code -->
      <template v-if="step === 'bio'">
        <span class="pin-bio-ico" aria-hidden="true"><Icon name="fingerprint" :size="44" /></span>
        <div class="stack" style="width: 100%; margin-top: auto">
          <button type="button" class="btn" @click="enableBio(true)">Activer</button>
          <button type="button" class="btn ghost" @click="enableBio(false)">Plus tard</button>
        </div>
      </template>

      <template v-else>
        <div :class="['pin-dots', { shake }]" aria-hidden="true">
          <span v-for="i in PIN_LENGTH" :key="i" :class="['pin-dot', { on: entry.length >= i }]" />
        </div>
        <p class="error" role="alert" style="min-height: 20px">{{ message }}</p>

        <button v-if="step === 'unlock' && canUseBio" type="button" class="link-btn" @click="tryBiometric">
          <Icon name="fingerprint" :size="20" style="vertical-align: middle" /> Utiliser mon empreinte
        </button>

        <div v-if="forgotOpen" class="card stack" style="text-align: left">
          <strong>Code oublié ?</strong>
          <span class="muted small">
            {{
              session.user?.pin_ok
                ? 'Tu vas être déconnecté. Reconnecte-toi avec le code reçu sur WhatsApp, puis choisis un nouveau code.'
                : 'Choisis un nouveau code. Par sécurité, tes autres appareils seront déconnectés.'
            }}
            Tes comptes ne sont pas perdus.
          </span>
          <div class="grid2">
            <button type="button" class="btn secondary" @click="forgotOpen = false">Annuler</button>
            <button type="button" class="btn" @click="forgot">Continuer</button>
          </div>
        </div>

        <div v-else class="pin-pad">
          <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" type="button" class="pin-key" :disabled="busy" @click="press(d)">{{ d }}</button>
          <button v-if="step === 'unlock'" type="button" class="pin-key flat" @click="forgotOpen = true">Oublié ?</button>
          <button v-else-if="pinState.changing" type="button" class="pin-key flat" @click="cancelChange">Annuler</button>
          <span v-else />
          <button type="button" class="pin-key" :disabled="busy" @click="press('0')">0</button>
          <button type="button" class="pin-key flat" aria-label="Effacer" :disabled="!entry" @click="erase"><Icon name="back" :size="26" /></button>
        </div>
      </template>
    </div>
  </div>
</template>
