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
import { formatAmount, parseAmount } from '../lib/format';
import { copyText, profileLink, shareText } from '../lib/links';
import { session } from '../lib/session';
import { formatUntil } from '../lib/sharing';
import { toast } from '../lib/toast';
import type { PublicProfile } from '../lib/types';

/**
 * Page d'un profil, ouverte sans compte ni app :
 * - /u/:username : profil public (ou privé, pour les personnes choisies par son propriétaire)
 * - /p/:token    : lien secret, valable jusqu'à sa date de fin
 * On n'y montre que le nom, le @pseudo et les comptes marqués « visibles » (jamais le numéro de connexion).
 */
const route = useRoute();
const token = computed(() => (route.params.token as string | undefined) ?? null);
const profile = ref<PublicProfile | null | undefined>(undefined);
/** Profil privé, et cette personne n'en fait pas partie */
const isPrivate = ref(false);
const link = computed(() => (profile.value ? profileLink(profile.value.username) : ''));
const isMe = computed(() => Boolean(profile.value && session.profile?.username === profile.value.username));
const myProfilePrivate = computed(() => isMe.value && session.profile?.visibility === 'private');
/** Affiche de commerçant : ?montant=2500&pour=Menu du jour (le client voit le prix avant de payer) */
const askedAmount = computed(() => {
  const raw = route.query.montant;
  const n = typeof raw === 'string' ? parseAmount(raw) : null;
  return n && n <= 50_000_000 ? n : null;
});
const askedNote = computed(() => (askedAmount.value && typeof route.query.pour === 'string' ? route.query.pour.trim().slice(0, 60) : ''));
// Ouvert avec un lien secret : on n'invite pas à le faire suivre
const canShare = computed(() => !token.value || isMe.value);

onMounted(async () => {
  try {
    profile.value = token.value
      ? await api.getSharedProfile(token.value)
      : await api.getPublicProfile((route.params.username as string).toLowerCase());
  } catch (e) {
    isPrivate.value = (e as Error).message === 'Ce profil est privé.';
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

    <div v-else-if="profile === null && isPrivate" class="card empty">
      <span class="badge-ico"><Icon name="lock" /></span>
      <strong>Ce profil est privé</strong>
      <p class="muted small">
        Seules les personnes choisies par son propriétaire peuvent le voir. Demande-lui de t'ajouter, ou de t'envoyer un lien d'accès.
      </p>
      <RouterLink v-if="!session.user" :to="{ path: '/login', query: { next: route.fullPath } }" class="btn secondary">
        Il m'a ajouté : me connecter
      </RouterLink>
    </div>

    <div v-else-if="profile === null" class="card empty">
      <strong>{{ token ? 'Ce lien ne marche plus' : "Cette page n'existe pas" }}</strong>
      <p class="muted small">
        {{
          token
            ? 'Il a expiré ou a été supprimé par son propriétaire. Demande-lui un nouveau lien.'
            : 'Le lien est peut-être mal écrit, ou la personne a supprimé son compte.'
        }}
      </p>
    </div>

    <div v-else class="stack">
      <section class="profile-hero">
        <Avatar :name="profile.full_name" :size="80" />
        <h1>{{ profile.full_name }}</h1>
        <span class="muted">@{{ profile.username }} <VerifiedPill v-if="profile.verified" /></span>
        <span v-if="token" class="pill info"><Icon name="lock" :size="13" /> Lien privé · {{ formatUntil(profile.shared_until ?? null) }}</span>
      </section>

      <p v-if="myProfilePrivate" class="note info">
        <Icon name="lock" />
        <span>
          Ton profil est privé : seules les personnes que tu as choisies et tes liens secrets l'ouvrent.
          <RouterLink to="/profile/visibility">Gérer</RouterLink>
        </span>
      </p>
      <p v-else-if="isMe" class="note info">
        <Icon name="alert" />
        <span>C'est ta page publique : voici ce que voient les personnes à qui tu envoies ton lien. Les comptes masqués n'y apparaissent pas.</span>
      </p>

      <div v-if="canShare" class="grid2">
        <button type="button" class="btn secondary" @click="share"><Icon name="share" :size="18" /> Partager</button>
        <button type="button" class="btn secondary" @click="copyLink"><Icon name="copy" :size="18" /> Copier le lien</button>
      </div>

      <div v-if="askedAmount" class="pay-amount">
        <span>Montant à payer</span>
        <strong>{{ formatAmount(askedAmount) }}</strong>
        <small v-if="askedNote" class="muted">{{ askedNote }}</small>
      </div>

      <PayPanel
        v-if="!isMe"
        :profile="profile"
        :amount="askedAmount"
        :note="askedNote"
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

      <QrBlock v-if="canShare" :value="link" caption="Ou scanne ce QR avec un autre téléphone" :file-name="`${profile.username}-qr.png`" />
    </div>
  </PublicShell>
</template>
