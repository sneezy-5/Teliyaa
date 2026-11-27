<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Avatar from './Avatar.vue';
import ErrorText from './ErrorText.vue';
import Icon from './Icon.vue';
import { api } from '../lib/api';
import {
  canPickContacts,
  countryCodeOf,
  emptySyncCache,
  inviteLink,
  loadSavedContacts,
  loadSyncCache,
  mergeContacts,
  pickContacts,
  resolveContacts,
  storeContacts,
  storeSyncCache,
  syncAddressBook,
  type RawContact,
  type SavedContact
} from '../lib/contacts';
import { COUNTRIES, formatPhone, toE164 } from '../lib/format';
import { profileLink } from '../lib/links';
import {
  contactsPermission,
  isNativeApp,
  readAddressBook,
  requestContactsPermission,
  type ContactsPermission
} from '../lib/nativeContacts';
import { getProvider } from '../lib/providers';
import { session } from '../lib/session';

/**
 * L'annuaire, comme WhatsApp.
 * - App installée (Android, iPhone) : tout le répertoire est relu à chaque ouverture, sans rien demander d'autre.
 * - Navigateur Chrome Android : l'utilisateur coche ses contacts.
 * - Autres navigateurs (iPhone…) : saisie d'un numéro.
 * Le serveur ne reçoit que des empreintes de numéros ; la liste reste sur ce téléphone.
 */
const userId = session.user?.id ?? '';
const myCode = countryCodeOf(session.user?.phone);
const native = isNativeApp();
const canPick = !native && canPickContacts();
const find = (hashes: string[]) => api.findContacts(hashes);

const contacts = ref<SavedContact[]>(loadSavedContacts(userId));
const permission = ref<ContactsPermission | null>(null);
const busy = ref(false);
const syncing = ref(false);
const error = ref<string | null>(null);
const summary = ref<string | null>(null);
const filter = ref('');
const showAllInvites = ref(false);
const showManual = ref(!native);
const country = ref(myCode);
const local = ref('');
const confirmClear = ref(false);

const INVITES_SHOWN = 15;
const plural = (n: number) => (n > 1 ? 's' : '');
const label = (c: SavedContact) => (c.name === c.phone ? formatPhone(c.phone) : c.name);
const providers = (c: SavedContact) => [...new Set((c.match?.aliases ?? []).map((a) => getProvider(a.provider_id).name))].join(' · ');

const visible = computed(() => {
  const q = filter.value.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  if (!q) return contacts.value;
  return contacts.value.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.match?.username.includes(q.replace(/^@/, '')) ||
      (digits.length >= 3 && c.phone.includes(digits))
  );
});
const onApp = computed(() => visible.value.filter((c) => c.match));
const toInvite = computed(() => visible.value.filter((c) => !c.match));
const invitesShown = computed(() => (showAllInvites.value || filter.value ? toInvite.value : toInvite.value.slice(0, INVITES_SHOWN)));
const myLink = computed(() => (session.profile ? profileLink(session.profile.username) : ''));

function save(list: SavedContact[]) {
  contacts.value = list;
  storeContacts(userId, list);
}

async function run(task: () => Promise<void>, flag = busy) {
  flag.value = true;
  error.value = null;
  try {
    await task();
  } catch (e) {
    error.value = (e as Error).message || 'Une erreur est survenue.';
  } finally {
    flag.value = false;
  }
}

// ---------- App installée : tout le répertoire ----------

/** `force` : tout revérifier maintenant (bouton Actualiser, première autorisation). */
function syncAll(force: boolean) {
  return run(async () => {
    const raw = await readAddressBook();
    const cache = force ? emptySyncCache() : loadSyncCache(userId);
    const result = await syncAddressBook(raw, myCode, cache, find);
    save(result.contacts);
    storeSyncCache(userId, result.cache);
    if (force) {
      const found = result.contacts.filter((c) => c.match).length;
      summary.value = `${found} de tes contacts ${found > 1 ? 'sont' : 'est'} sur Teliyaa.`;
    }
  }, syncing);
}

async function allow() {
  permission.value = await requestContactsPermission();
  if (permission.value === 'granted') await syncAll(true);
}

onMounted(async () => {
  if (!native) return;
  permission.value = await contactsPermission();
  if (permission.value === 'granted') await syncAll(false);
});

// ---------- Navigateur ----------

async function lookup(raw: RawContact[]) {
  const { contacts: added, skipped } = await resolveContacts(raw, myCode, find);
  save(mergeContacts(contacts.value, added));
  return { found: added.filter((c) => c.match).length, total: added.length, skipped };
}

function pick() {
  summary.value = null;
  return run(async () => {
    let raw: RawContact[];
    try {
      raw = await pickContacts();
    } catch {
      throw new Error("Impossible d'ouvrir le répertoire. Vérifie l'autorisation d'accès aux contacts.");
    }
    if (raw.length === 0) return;
    const { found, total, skipped } = await lookup(raw);
    summary.value =
      `${found} contact${plural(found)} sur Teliyaa, sur ${total} choisi${plural(total)}.` +
      (skipped ? ` ${skipped} sans numéro valide de la zone UEMOA.` : '');
  });
}

function refreshPicked() {
  summary.value = null;
  return run(async () => {
    const raw = contacts.value.map((c) => ({ name: c.name === c.phone ? '' : c.name, phones: [c.phone] }));
    const { found } = await lookup(raw);
    summary.value = `Liste à jour : ${found} sur Teliyaa.`;
  });
}

// ---------- Les deux : un numéro tapé à la main ----------

function searchNumber() {
  const e164 = toE164(country.value, local.value);
  if (!e164) {
    error.value = `Le numéro doit avoir ${COUNTRIES.find((c) => c.code === country.value)?.digits} chiffres.`;
    return;
  }
  summary.value = null;
  return run(async () => {
    const { found } = await lookup([{ name: '', phones: [e164] }]);
    summary.value = found ? 'Trouvé ! Il est dans ta liste ci-dessous.' : `${formatPhone(e164)} n'est pas encore sur Teliyaa. Tu peux l'inviter.`;
    local.value = '';
  });
}

function clearAll() {
  save([]);
  storeSyncCache(userId, null);
  confirmClear.value = false;
  summary.value = null;
}
</script>

<template>
  <div class="stack">
    <!-- App installée : demande d'accès au répertoire -->
    <div v-if="native && permission === 'prompt'" class="card empty">
      <strong>Retrouve tous tes contacts</strong>
      <span class="muted small">
        Teliyaa compare les numéros de ton répertoire pour afficher ceux qui ont un compte, avec leurs alias Wave,
        Orange Money, banque… Tu n'as plus besoin de demander un pseudo ou un numéro de compte.
      </span>
      <button type="button" class="btn" :disabled="syncing" @click="allow"><Icon name="user" :size="18" /> Autoriser l'accès à mes contacts</button>
    </div>
    <div v-else-if="native && permission === 'denied'" class="note warn">
      <Icon name="alert" :size="18" />
      <span>Tu as refusé l'accès aux contacts. Pour l'activer : <strong>Réglages du téléphone → Teliyaa → Contacts</strong>, puis reviens ici.</span>
    </div>
    <p v-if="native && syncing" class="muted small" role="status">Mise à jour de tes contacts…</p>

    <!-- Navigateur -->
    <button v-if="canPick" type="button" class="btn" :disabled="busy" @click="pick">
      <Icon name="user" :size="18" /> {{ busy ? 'Recherche…' : 'Choisir dans mes contacts' }}
    </button>
    <div v-else-if="!native" class="note info">
      <Icon name="alert" :size="18" />
      <span>Ce navigateur ne permet pas d'ouvrir ton répertoire. Tape le numéro de ton contact ci-dessous, ou cherche son @pseudo. L'app mobile, qui retrouvera tous tes contacts d'un coup, arrive bientôt.</span>
    </div>

    <ErrorText :message="error" />
    <p v-if="summary" class="note ok" role="status">{{ summary }}</p>

    <label v-if="contacts.length > 8" class="search">
      <Icon name="search" />
      <input v-model="filter" placeholder="Rechercher un contact" autocapitalize="none" autocorrect="off" aria-label="Rechercher dans mes contacts" />
    </label>

    <template v-if="onApp.length">
      <div class="section-head"><h2>Sur Teliyaa ({{ onApp.length }})</h2></div>
      <ul class="list">
        <li v-for="c in onApp" :key="c.phone" class="contact-row">
          <!-- Toucher le contact : sa fiche avec tous ses comptes ; sous chaque compte, on choisit son app -->
          <RouterLink :to="`/send/${c.match!.username}`" class="card alias choice" :aria-label="`Voir les comptes de ${label(c)}`">
            <Avatar :name="label(c)" />
            <span class="grow">
              <strong>{{ label(c) }}</strong>
              <span class="muted small block">@{{ c.match!.username }}</span>
              <span v-if="providers(c)" class="small block ok-text">{{ providers(c) }}</span>
            </span>
            <Icon name="chevron" :size="18" class="muted" />
          </RouterLink>
        </li>
      </ul>
    </template>
    <p v-else-if="contacts.length && !filter && !syncing" class="muted">Aucun de tes contacts n'est encore sur Teliyaa. Invite-les !</p>

    <template v-if="toInvite.length">
      <div class="section-head"><h2>Inviter sur Teliyaa ({{ toInvite.length }})</h2></div>
      <ul class="list">
        <li v-for="c in invitesShown" :key="c.phone" class="card alias">
          <Avatar :name="label(c)" />
          <span class="grow">
            <strong>{{ label(c) }}</strong>
            <span class="muted small block">{{ formatPhone(c.phone) }}</span>
          </span>
          <a :href="inviteLink(c.phone, myLink)" target="_blank" rel="noopener" class="link-btn">Inviter</a>
        </li>
      </ul>
      <button v-if="invitesShown.length < toInvite.length" type="button" class="btn ghost" @click="showAllInvites = true">
        Voir les {{ toInvite.length - invitesShown.length }} autres
      </button>
    </template>

    <!-- Numéro tapé à la main (toujours possible : quelqu'un qui n'est pas dans le répertoire) -->
    <button v-if="!showManual" type="button" class="link-btn" @click="showManual = true">Chercher un numéro qui n'est pas dans mes contacts</button>
    <form v-else class="stack" @submit.prevent="searchNumber">
      <div class="phone-row">
        <label class="field">
          <span>Pays</span>
          <select v-model="country">
            <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">{{ c.code }}</option>
          </select>
        </label>
        <label class="field grow">
          <span>{{ canPick ? 'Ou tape un numéro' : 'Numéro du contact' }}</span>
          <input v-model="local" inputmode="tel" placeholder="07 00 00 00 01" aria-label="Numéro de téléphone du contact" />
        </label>
      </div>
      <button class="btn secondary" :disabled="busy || !local.trim()">Chercher ce numéro</button>
      <p v-if="api.mode === 'demo'" class="muted small">En mode démo, essaie 07 00 00 00 01 ou 05 00 00 00 04.</p>
    </form>

    <template v-if="contacts.length">
      <button v-if="native && permission === 'granted'" type="button" class="btn ghost" :disabled="syncing" @click="syncAll(true)">Actualiser mes contacts</button>
      <button v-else-if="!native" type="button" class="btn ghost" :disabled="busy" @click="refreshPicked">Actualiser la liste</button>
      <button v-if="!confirmClear" type="button" class="link-btn small danger-text" @click="confirmClear = true">Effacer cette liste du téléphone</button>
      <div v-else class="card stack">
        <strong>Effacer la liste de contacts de ce téléphone ?</strong>
        <span v-if="native" class="muted small">Elle sera recréée à la prochaine ouverture, tant que l'accès aux contacts est autorisé.</span>
        <div class="grid2">
          <button type="button" class="btn secondary" @click="confirmClear = false">Non</button>
          <button type="button" class="btn danger" @click="clearAll">Oui, effacer</button>
        </div>
      </div>
    </template>

    <p class="muted small">
      Seule une empreinte de chaque numéro est envoyée pour la comparaison. Ton répertoire n'est pas enregistré
      sur nos serveurs : cette liste reste sur ce téléphone.
    </p>
  </div>
</template>
