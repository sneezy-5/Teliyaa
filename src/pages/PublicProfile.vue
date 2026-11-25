<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AliasCard from '../components/AliasCard.vue';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';
import PayPanel from '../components/PayPanel.vue';
import PublicShell from '../components/PublicShell.vue';
import QrBlock from '../components/QrBlock.vue';
import Spinner from '../components/Spinner.vue';
import VerifiedPill from '../components/VerifiedPill.vue';
import { api } from '../lib/api';
import { copyText, profileLink, shareText } from '../lib/links';
import { session } from '../lib/session';
import { toast } from '../lib/toast';
import type { PublicProfile } from '../lib/types';

/**
 * /u/:username — profil public : n'importe qui peut l'ouvrir et payer, sans compte ni app.
 * On n'y montre que le nom, le @pseudo et les comptes marqués « visibles » (jamais le numéro de connexion).
 */
const route = useRoute();
const profile = ref<PublicProfile | null | undefined>(undefined);
const link = computed(() => (profile.value ? profileLink(profile.value.username) : ''));
const isMe = computed(() => Boolean(profile.value && session.profile?.username === profile.value.username));

onMounted(async () => {
  try {
    profile.value = await api.getPublicProfile((route.params.username as string).toLowerCase());
  } catch {
    profile.value = null;
  }
  if (profile.value) document.title = `Payer ${profile.value.full_name} — Teliyaa`;
});

const share = () =>
  shareText(
    isMe.value ? 'Pour me payer (Wave, Orange Money, banque…) :' : `Pour payer ${profile.value?.full_name} (Wave, Orange Money, banque…) :`,
    link.value
  );
const copyLink = async () => toast((await copyText(link.value)) ? 'Lien copié' : 'Copie impossible');
</script>

<template>
  <PublicShell>
    <Spinner v-if="profile === undefined" />
    <div v-else-if="profile === null" class="card empty">
      <strong>Cette page n'existe pas</strong>
      <p class="muted small">Le lien est peut-être mal écrit, ou la personne a supprimé son compte.</p>
    </div>
    <div v-else class="stack">
      <section class="profile-hero">
        <Avatar :name="profile.full_name" :size="80" />
        <h1>{{ profile.full_name }}</h1>
        <span class="muted">@{{ profile.username }} <VerifiedPill v-if="profile.verified" /></span>
      </section>

      <p v-if="isMe" class="note info">
        <Icon name="alert" />
        <span>C'est ta page publique : voici ce que voient les personnes à qui tu envoies ton lien. Les comptes masqués n'y apparaissent pas.</span>
      </p>

      <div class="grid2">
        <button type="button" class="btn secondary" @click="share"><Icon name="share" :size="18" /> Partager</button>
        <button type="button" class="btn secondary" @click="copyLink"><Icon name="copy" :size="18" /> Copier le lien</button>
      </div>

      <PayPanel
        v-if="!isMe"
        :profile="profile"
        :amount="null"
        note=""
        :favorite-provider="session.profile?.favorite_provider"
        :logged-in="Boolean(session.user && session.profile)"
      />
      <template v-else>
        <div class="section-head"><h2>Mes comptes visibles</h2></div>
        <p v-if="profile.aliases.length === 0" class="note">Aucun compte visible pour l'instant.</p>
        <ul v-else class="acct-list">
          <li v-for="a in profile.aliases" :key="a.id"><AliasCard :alias="a" /></li>
        </ul>
      </template>

      <QrBlock :value="link" caption="Ou scanne ce QR avec un autre téléphone" :file-name="`${profile.username}-qr.png`" />
    </div>
  </PublicShell>
</template>
