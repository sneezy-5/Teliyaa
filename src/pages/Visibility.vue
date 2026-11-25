<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import Avatar from '../components/Avatar.vue';
import ErrorText from '../components/ErrorText.vue';
import Icon from '../components/Icon.vue';
import Spinner from '../components/Spinner.vue';
import { api } from '../lib/api';
import { copyText, prettyLink, profileLink, secretLink, shareText } from '../lib/links';
import { session } from '../lib/session';
import { DURATIONS, formatUntil } from '../lib/sharing';
import { toast } from '../lib/toast';
import type { PublicProfile, ShareDuration, ShareLink, Sharing, Visibility } from '../lib/types';

/**
 * Qui peut voir mon profil : tout le monde, ou seulement qui je choisis
 * (comptes Teliyaa ajoutés + liens secrets), chacun pour une durée au choix.
 */
const sharing = ref<Sharing | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

async function run(action: () => Promise<Sharing>) {
  busy.value = true;
  error.value = null;
  try {
    apply(await action());
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function apply(s: Sharing) {
  sharing.value = s;
  if (session.profile) session.profile.visibility = s.visibility;
}

onMounted(() => run(() => api.getSharing()));

const choose = (v: Visibility) => {
  if (sharing.value?.visibility !== v) run(() => api.setVisibility(v));
};

// ---------- Personnes ----------
const q = ref('');
const grantFor = ref<ShareDuration>('forever');
const suggestions = ref<PublicProfile[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(q, (value) => {
  clearTimeout(timer);
  if (value.trim().replace(/^@/, '').length < 2) return (suggestions.value = []);
  timer = setTimeout(() => {
    api.searchProfiles(value).then((r) => (suggestions.value = r.slice(0, 5))).catch(() => (suggestions.value = []));
  }, 250);
});

async function addGrant(username: string) {
  const u = username.trim().replace(/^@/, '').toLowerCase();
  if (!u) return;
  await run(() => api.addGrant(u, grantFor.value));
  if (!error.value) {
    q.value = '';
    suggestions.value = [];
    toast(`@${u} peut voir ton profil`);
  }
}

const removeGrant = (username: string) => run(() => api.removeGrant(username));

// ---------- Liens secrets ----------
const linkFor = ref<ShareDuration>('7d');

async function createLink() {
  busy.value = true;
  error.value = null;
  try {
    const { link, sharing: s } = await api.createShareLink(linkFor.value);
    apply(s);
    await shareLink(link);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const shareLink = (l: ShareLink) => shareText('Pour me payer (Wave, Orange Money, banque…) :', secretLink(l.token));
const copyLink = async (l: ShareLink) => toast((await copyText(secretLink(l.token))) ? 'Lien copié' : 'Copie impossible');
const deleteLink = (l: ShareLink) => run(() => api.deleteShareLink(l.id));
</script>

<template>
  <main class="page">
    <header class="topbar">
      <RouterLink to="/profile" class="icon-btn" aria-label="Retour"><Icon name="back" :size="24" /></RouterLink>
      <h1>Qui peut voir mon profil</h1>
    </header>

    <Spinner v-if="!sharing && !error" />
    <ErrorText :message="error" />

    <template v-if="sharing">
      <div class="stack" role="radiogroup" aria-label="Visibilité du profil">
        <button
          type="button"
          role="radio"
          :aria-checked="sharing.visibility === 'public'"
          :class="['card', 'choice', { primary: sharing.visibility === 'public' }]"
          :disabled="busy"
          @click="choose('public')"
        >
          <span class="badge-ico"><Icon name="globe" /></span>
          <span class="grow">
            <strong>Tout le monde</strong>
            <span class="muted small block">Ton lien et ton QR marchent pour tous, même sans compte.</span>
          </span>
          <Icon v-if="sharing.visibility === 'public'" name="check" class="ok-text" />
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="sharing.visibility === 'private'"
          :class="['card', 'choice', { primary: sharing.visibility === 'private' }]"
          :disabled="busy"
          @click="choose('private')"
        >
          <span class="badge-ico"><Icon name="lock" /></span>
          <span class="grow">
            <strong>Seulement qui je choisis</strong>
            <span class="muted small block">Les personnes que tu ajoutes, et tes liens secrets à durée limitée.</span>
          </span>
          <Icon v-if="sharing.visibility === 'private'" name="check" class="ok-text" />
        </button>
      </div>

      <template v-if="sharing.visibility === 'private'">
        <p class="note info">
          <Icon name="lock" />
          <span>
            {{ prettyLink(profileLink(session.profile?.username ?? '')) }} et ton QR ne s'ouvrent plus que pour ces personnes.
            Tu n'apparais plus dans la recherche ni dans les contacts des autres.
          </span>
        </p>

        <!-- Personnes (comptes Teliyaa) -->
        <section class="stack">
          <div class="section-head">
            <h2>Personnes</h2>
            <span class="muted small">{{ sharing.grants.length }}</span>
          </div>
          <p class="muted small">Elles voient ton profil dans Teliyaa, une fois connectées.</p>

          <form class="share-add" @submit.prevent="addGrant(q)">
            <label class="search grow">
              <Icon name="search" />
              <input v-model="q" placeholder="@pseudo de la personne" autocapitalize="none" autocorrect="off" aria-label="@pseudo à ajouter" />
            </label>
            <button class="btn share-add-btn" :disabled="busy || !q.trim()">Ajouter</button>
          </form>
          <ul v-if="suggestions.length" class="list">
            <li v-for="p in suggestions" :key="p.username">
              <button type="button" class="card alias share-suggest" :disabled="busy" @click="addGrant(p.username)">
                <Avatar :name="p.full_name" :size="36" />
                <span class="grow">
                  <strong>@{{ p.username }}</strong>
                  <span class="muted small block">{{ p.full_name }}</span>
                </span>
                <Icon name="plus" class="ok-text" />
              </button>
            </li>
          </ul>

          <div class="chips" role="group" aria-label="Durée pour les personnes ajoutées">
            <span class="muted small">Pendant</span>
            <button v-for="d in DURATIONS" :key="d.id" type="button" :class="['chip', { on: grantFor === d.id }]" @click="grantFor = d.id">
              {{ d.label }}
            </button>
          </div>

          <p v-if="sharing.grants.length === 0" class="note">Personne pour l'instant.</p>
          <ul v-else class="list">
            <li v-for="g in sharing.grants" :key="g.username" class="share-row">
              <Avatar :name="g.full_name" :size="40" />
              <span class="grow">
                <strong>@{{ g.username }}</strong>
                <span class="muted small block">{{ g.full_name }} · {{ formatUntil(g.expires_at) }}</span>
              </span>
              <button type="button" class="icon-btn" :aria-label="`Retirer @${g.username}`" :disabled="busy" @click="removeGrant(g.username)">
                <Icon name="close" :size="20" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Liens secrets (sans compte) -->
        <section class="stack">
          <div class="section-head">
            <h2>Liens secrets</h2>
            <span class="muted small">{{ sharing.links.length }}</span>
          </div>
          <p class="muted small">
            Pour quelqu'un sans compte Teliyaa : il ouvre ton profil avec ce lien jusqu'à la fin choisie. Tu peux le supprimer à tout moment.
          </p>

          <div class="chips" role="group" aria-label="Durée du lien">
            <span class="muted small">Valable</span>
            <button v-for="d in DURATIONS" :key="d.id" type="button" :class="['chip', { on: linkFor === d.id }]" @click="linkFor = d.id">
              {{ d.label }}
            </button>
          </div>
          <button type="button" class="btn" :disabled="busy" @click="createLink"><Icon name="link" :size="20" /> Créer et partager un lien</button>

          <ul v-if="sharing.links.length" class="list">
            <li v-for="l in sharing.links" :key="l.id" class="share-row">
              <span class="badge-ico"><Icon name="link" :size="20" /></span>
              <span class="grow">
                <strong class="share-url">{{ prettyLink(secretLink(l.token)) }}</strong>
                <span class="muted small block">{{ formatUntil(l.expires_at) }}</span>
              </span>
              <button type="button" class="icon-btn" aria-label="Copier le lien" @click="copyLink(l)"><Icon name="copy" :size="19" /></button>
              <button type="button" class="icon-btn" aria-label="Partager le lien" @click="shareLink(l)"><Icon name="share" :size="19" /></button>
              <button type="button" class="icon-btn" aria-label="Supprimer le lien" :disabled="busy" @click="deleteLink(l)">
                <Icon name="trash" :size="19" />
              </button>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </main>
</template>
