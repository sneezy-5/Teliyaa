<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '../components/Avatar.vue';
import BottomNav from '../components/BottomNav.vue';
import ErrorText from '../components/ErrorText.vue';
import Icon from '../components/Icon.vue';
import ProviderBadge from '../components/ProviderBadge.vue';
import VerifiedPill from '../components/VerifiedPill.vue';
import { api } from '../lib/api';
import { resetDemo } from '../lib/api/demo';
import { formatPhone } from '../lib/format';
import { biometricAvailable, biometricEnabled, biometricVerify, pinState, setBiometricEnabled } from '../lib/pin';
import { getProvider, PAYER_APPS } from '../lib/providers';
import { preferredApp, rememberApp } from '../lib/quickPay';
import { refreshProfile, session } from '../lib/session';

/** Profil : qui je suis, puis quelques réglages en lignes simples. */
const router = useRouter();
const saving = ref(false);
const confirmReset = ref(false);
const choosingApp = ref(false);
const myApp = ref<string | null>(preferredApp());
const profile = computed(() => session.profile);
const apps = PAYER_APPS;

async function update(patch: { discoverable?: boolean; findable_by_phone?: boolean }) {
  if (!profile.value) return;
  saving.value = true;
  try {
    await api.saveMyProfile({ username: profile.value.username, full_name: profile.value.full_name, ...patch });
    await refreshProfile();
  } finally {
    saving.value = false;
  }
}

function chooseApp(id: string) {
  rememberApp(id); // ce téléphone + mon profil
  myApp.value = id;
  choosingApp.value = false;
}

const confirmDelete = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

async function deleteAccount() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await api.deleteAccount();
    // Effacer aussi ce qui est gardé sur le téléphone (liste de contacts, app préférée…)
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('tonapp-') || k.startsWith('teliyaa-'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* rien */
    }
    await router.replace('/');
  } catch (e) {
    deleteError.value = (e as Error).message;
  } finally {
    deleting.value = false;
  }
}

// Empreinte digitale / visage : seulement dans l'app installée, si le téléphone en a une
const bioAvailable = ref(false);
const bioOn = ref(Boolean(session.user && biometricEnabled(session.user.id)));
onMounted(async () => (bioAvailable.value = await biometricAvailable()));

async function toggleBio(input: HTMLInputElement) {
  const on = input.checked;
  if (!session.user) return;
  // On demande l'empreinte pour l'activer : c'est bien celle du propriétaire
  if (on && !(await biometricVerify())) {
    input.checked = false;
    return;
  }
  setBiometricEnabled(session.user.id, on);
  bioOn.value = on;
}

async function signOut() {
  if (session.user) setBiometricEnabled(session.user.id, false);
  await api.signOut();
  await router.replace('/');
}

async function reset() {
  resetDemo();
  await router.replace('/');
}
</script>

<template>
  <main v-if="profile" class="page with-nav">
    <div class="center-col" style="padding-top: 16px">
      <Avatar :name="profile.full_name" :size="72" />
      <h1 class="h1">{{ profile.full_name }}</h1>
      <span class="muted">@{{ profile.username }} <VerifiedPill v-if="profile.verified" /></span>
      <span class="muted small">{{ formatPhone(profile.phone) }}</span>
    </div>

    <ul class="list settings">
      <li>
        <RouterLink to="/onboarding" class="setting-row">
          <span class="grow">Nom et pseudo</span>
          <Icon name="chevron" :size="18" class="muted" />
        </RouterLink>
      </li>

      <li>
        <button type="button" class="setting-row" :aria-expanded="choosingApp" @click="choosingApp = !choosingApp">
          <span class="grow">
            Mon app pour payer
            <span class="muted small block">S'ouvre quand j'envoie de l'argent</span>
          </span>
          <span class="setting-value">{{ myApp ? getProvider(myApp).name : 'À choisir' }}</span>
          <Icon name="chevron" :size="18" class="muted" />
        </button>
        <div v-if="choosingApp" class="app-grid" style="padding-bottom: 14px">
          <button v-for="p in apps" :key="p.id" type="button" :class="['app-tile', { on: myApp === p.id }]" @click="chooseApp(p.id)">
            <ProviderBadge :provider-id="p.id" />
            <span>{{ p.name }}</span>
          </button>
        </div>
      </li>

      <li>
        <label class="setting-row">
          <span class="grow">
            Me trouver par mon @pseudo
            <span class="muted small block">Dans la recherche des autres</span>
          </span>
          <input
            type="checkbox"
            class="switch"
            :checked="profile.discoverable"
            :disabled="saving"
            @change="update({ discoverable: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </li>

      <li>
        <label class="setting-row">
          <span class="grow">
            Me trouver par mon numéro
            <span class="muted small block">Pour ceux qui l'ont dans leurs contacts</span>
          </span>
          <input
            type="checkbox"
            class="switch"
            :checked="profile.findable_by_phone !== false"
            :disabled="saving"
            @change="update({ findable_by_phone: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </li>

      <li>
        <button type="button" class="setting-row" @click="pinState.changing = true">
          <span class="grow">
            Changer mon code PIN
            <span class="muted small block">Demandé à chaque ouverture de l'app</span>
          </span>
          <Icon name="chevron" :size="18" class="muted" />
        </button>
      </li>

      <li v-if="bioAvailable">
        <label class="setting-row">
          <span class="grow">
            Ouvrir avec mon empreinte
            <span class="muted small block">Ou mon visage, à la place du code</span>
          </span>
          <input type="checkbox" class="switch" :checked="bioOn" @change="toggleBio($event.target as HTMLInputElement)" />
        </label>
      </li>

      <li>
        <RouterLink :to="`/u/${profile.username}`" class="setting-row">
          <span class="grow">
            Mon profil public
            <span class="muted small block">Ce que voient ceux qui ont ton lien, même sans compte</span>
          </span>
          <Icon name="chevron" :size="18" class="muted" />
        </RouterLink>
      </li>

      <li>
        <RouterLink to="/confidentialite" class="setting-row">
          <span class="grow">Confidentialité</span>
          <Icon name="chevron" :size="18" class="muted" />
        </RouterLink>
      </li>

      <li>
        <RouterLink to="/conditions" class="setting-row">
          <span class="grow">Conditions d'utilisation</span>
          <Icon name="chevron" :size="18" class="muted" />
        </RouterLink>
      </li>
    </ul>

    <button type="button" class="btn ghost danger-text" @click="signOut">Se déconnecter</button>

    <button v-if="!confirmDelete" type="button" class="link-btn small center" style="color: var(--muted)" @click="confirmDelete = true">
      Supprimer mon compte
    </button>
    <div v-else class="card stack">
      <strong>Supprimer définitivement ton compte ?</strong>
      <span class="muted small">Ton profil, ton @pseudo et tous tes comptes seront effacés. Personne ne pourra plus te trouver. C'est irréversible.</span>
      <ErrorText :message="deleteError" />
      <div class="grid2">
        <button type="button" class="btn secondary" :disabled="deleting" @click="confirmDelete = false">Annuler</button>
        <button type="button" class="btn danger" :disabled="deleting" @click="deleteAccount">{{ deleting ? 'Suppression…' : 'Supprimer' }}</button>
      </div>
    </div>

    <template v-if="api.mode === 'demo'">
      <button v-if="!confirmReset" type="button" class="link-btn small center" style="color: var(--muted)" @click="confirmReset = true">Réinitialiser la démo</button>
      <div v-else class="card stack">
        <strong>Effacer toutes les données de démo ?</strong>
        <div class="grid2">
          <button type="button" class="btn secondary" @click="confirmReset = false">Non</button>
          <button type="button" class="btn danger" @click="reset">Oui, effacer</button>
        </div>
      </div>
    </template>
  </main>
  <BottomNav active="profile" />
</template>
