<script setup lang="ts">
import { ref, watch } from 'vue';
import Avatar from '../components/Avatar.vue';
import BottomNav from '../components/BottomNav.vue';
import ContactsPanel from '../components/ContactsPanel.vue';
import Icon from '../components/Icon.vue';
import VerifiedPill from '../components/VerifiedPill.vue';
import { api } from '../lib/api';
import { isNativeApp } from '../lib/nativeContacts';
import type { PublicProfile } from '../lib/types';

/** Deux façons de trouver quelqu'un : son @pseudo, ou son numéro dans mes contacts. */
// Dans l'app installée, l'annuaire est la porte d'entrée ; dans le navigateur, le @pseudo.
const TAB_KEY = 'tonapp-send-tab';
const savedTab = sessionStorage.getItem(TAB_KEY);
const tab = ref<'pseudo' | 'contacts'>(savedTab === 'pseudo' || savedTab === 'contacts' ? savedTab : isNativeApp() ? 'contacts' : 'pseudo');
watch(tab, (t) => sessionStorage.setItem(TAB_KEY, t));

/** Recherche par @pseudo : seuls les profils « visibles dans la recherche » apparaissent. */
const q = ref('');
const results = ref<PublicProfile[] | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(q, (value) => {
  clearTimeout(timer);
  if (value.trim().replace(/^@/, '').length < 2) return (results.value = null);
  timer = setTimeout(() => {
    api.searchProfiles(value).then((r) => (results.value = r)).catch(() => (results.value = []));
  }, 250);
});
</script>

<template>
  <main class="page with-nav">
    <header class="hello"><h1>Envoyer à…</h1></header>

    <div class="tabs two" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'pseudo'" :class="['tab', { on: tab === 'pseudo' }]" @click="tab = 'pseudo'">
        <Icon name="search" :size="16" /> @pseudo
      </button>
      <button type="button" role="tab" :aria-selected="tab === 'contacts'" :class="['tab', { on: tab === 'contacts' }]" @click="tab = 'contacts'">
        <Icon name="user" :size="16" /> Mes contacts
      </button>
    </div>

    <ContactsPanel v-if="tab === 'contacts'" />

    <template v-else>
      <label class="search">
        <Icon name="search" />
        <input v-model="q" placeholder="@pseudo ou nom" autocapitalize="none" autocorrect="off" aria-label="Rechercher un @pseudo" autofocus />
      </label>

      <p v-if="results === null" class="muted small">
        Tape au moins 2 lettres.<template v-if="api.mode === 'demo'"> Astuce : en mode démo, essaie « ami ».</template>
      </p>
      <p v-else-if="results.length === 0" class="muted">Personne trouvé. Cherche-le dans « Mes contacts » ou demande-lui son lien de paiement.</p>
      <ul v-else class="list">
        <li v-for="p in results" :key="p.username">
          <RouterLink :to="`/send/${p.username}`" class="card alias">
            <Avatar :name="p.full_name" />
            <span class="grow">
              <strong>@{{ p.username }}</strong> <VerifiedPill v-if="p.verified" />
              <span class="muted small block">{{ p.full_name }}</span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </main>
  <BottomNav active="send" />
</template>
