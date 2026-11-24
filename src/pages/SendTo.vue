<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Avatar from '../components/Avatar.vue';
import PayPanel from '../components/PayPanel.vue';
import Spinner from '../components/Spinner.vue';
import TopBar from '../components/TopBar.vue';
import VerifiedPill from '../components/VerifiedPill.vue';
import { api } from '../lib/api';
import { session } from '../lib/session';
import type { PublicProfile } from '../lib/types';

/**
 * Envoi depuis l'app : pas d'étape de montant (il se tape dans Wave / Orange Money…).
 * `?sent=wave` : l'app a déjà été ouverte depuis la liste de contacts, on attend la confirmation.
 */
const route = useRoute();
const username = route.params.username as string;
const sentWith = typeof route.query.sent === 'string' ? route.query.sent : null;
const profile = ref<PublicProfile | null | undefined>(undefined);

onMounted(() => {
  api.getPublicProfile(username).then((p) => (profile.value = p)).catch(() => (profile.value = null));
});
</script>

<template>
  <Spinner v-if="profile === undefined" />
  <main v-else-if="profile === null" class="page">
    <TopBar title="Envoyer" back="/send" />
    <p class="muted">@{{ username }} est introuvable.</p>
  </main>
  <main v-else class="page">
    <TopBar title="Envoyer" back="/send" />
    <div class="stack">
      <div class="center-col">
        <Avatar :name="profile.full_name" :size="72" />
        <h1 class="h1">{{ profile.full_name }}</h1>
        <span class="muted">@{{ profile.username }} <VerifiedPill v-if="profile.verified" /></span>
      </div>
      <PayPanel :profile="profile" :amount="null" note="" :favorite-provider="session.profile?.favorite_provider" :sent-with="sentWith" logged-in />
    </div>
  </main>
</template>
