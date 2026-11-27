<script setup lang="ts">
import QRCode from 'qrcode';
import { computed, onMounted, ref, watch, watchEffect } from 'vue';
import Icon from '../components/Icon.vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../lib/api';
import { formatAmount, parseAmount } from '../lib/format';
import { copyText, payLink, prettyLink, shareText } from '../lib/links';
import { POSTER_APPS, posterPng, shareOrSavePng } from '../lib/poster';
import { session } from '../lib/session';
import { toast } from '../lib/toast';
import type { Alias } from '../lib/types';

/**
 * Mon commerce : pourquoi Teliyaa vaut le coup pour encaisser, puis l'affiche de comptoir
 * (un QR pour toutes les apps, montant fixe facultatif) à imprimer ou à partager en image.
 */
const profile = computed(() => session.profile);
const logoUrl = `${import.meta.env.BASE_URL}icone-512.png`;

// Le nom sur l'affiche est retenu sur ce téléphone (ex. « Maquis Chez Awa »)
const NAME_KEY = 'teliyaa-shop-name';
function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
const shopName = ref(readName() || profile.value?.full_name || '');
watch(shopName, (v) => {
  try {
    localStorage.setItem(NAME_KEY, v.trim());
  } catch {
    /* stockage indisponible */
  }
});

const amountText = ref('');
const note = ref('');
const amount = computed(() => parseAmount(amountText.value));
const amountError = computed(() => (amountText.value.trim() && !amount.value ? 'Montant invalide : écris seulement des chiffres, ex. 2 500.' : null));
const link = computed(() => payLink(profile.value?.username ?? '', amount.value, note.value));

const qr = ref<string | null>(null);
watchEffect(async (onCleanup) => {
  let alive = true;
  onCleanup(() => (alive = false));
  const value = link.value;
  try {
    const url = await QRCode.toDataURL(value, { margin: 1, width: 480, color: { dark: '#111827', light: '#FFFFFF' } });
    if (alive) qr.value = url;
  } catch {
    if (alive) qr.value = null;
  }
});

// Sans compte visible, l'affiche ne sert à rien : on prévient
const aliases = ref<Alias[] | null>(null);
const visibleCount = computed(() => aliases.value?.filter((a) => a.visible).length ?? 0);
onMounted(() => {
  api.listMyAliases().then((l) => (aliases.value = l)).catch(() => (aliases.value = []));
});

const busy = ref(false);
async function saveImage() {
  if (!profile.value) return;
  busy.value = true;
  try {
    const png = await posterPng({ name: shopName.value.trim(), link: link.value, amount: amount.value, note: note.value.trim() });
    const how = await shareOrSavePng(png, `${profile.value.username}-affiche.png`, 'Payez-moi avec Wave, Orange Money, MTN ou Moov :');
    if (how === 'saved') toast('Affiche enregistrée');
  } catch (e) {
    toast((e as Error).message || 'Image impossible');
  } finally {
    busy.value = false;
  }
}

const print = () => window.print();
const share = () =>
  shareText(
    amount.value ? `Pour me payer ${formatAmount(amount.value)}${note.value.trim() ? ` (${note.value.trim()})` : ''} :` : 'Pour me payer (Wave, Orange Money, MTN, Moov…) :',
    link.value
  );
const copyLink = async () => toast((await copyText(link.value)) ? 'Lien copié' : 'Copie impossible');
</script>

<template>
  <main v-if="profile" class="page">
    <TopBar title="Mon commerce" back="/" />

    <!-- La plus-value, en clair -->
    <section class="stack">
      <h2 class="h1">Encaisse tous tes clients avec un seul QR</h2>
      <ul class="why-list">
        <li>
          <span class="badge-ico"><Icon name="qr" :size="18" /></span>
          <span><strong>Un QR pour toutes les apps</strong><span class="muted">Wave, Orange Money, MTN MoMo, Moov Money ou banque : le client paie avec la sienne.</span></span>
        </li>
        <li>
          <span class="badge-ico"><Icon name="lock" :size="18" /></span>
          <span><strong>L'argent arrive directement chez toi</strong><span class="muted">Sur ton compte Wave, Orange… Teliyaa ne garde rien et ne touche jamais à ton argent.</span></span>
        </li>
        <li>
          <span class="badge-ico"><Icon name="check" :size="18" /></span>
          <span><strong>0 F de commission Teliyaa</strong><span class="muted">Pas de terminal à acheter, pas d'abonnement. Une affiche suffit.</span></span>
        </li>
        <li>
          <span class="badge-ico"><Icon name="store" :size="18" /></span>
          <span><strong>Prix fixe si tu veux</strong><span class="muted">Le client voit le montant avant de payer : moins d'erreurs, moins de discussions.</span></span>
        </li>
      </ul>
      <div class="compare">
        <div class="before">
          <h3>Sans Teliyaa</h3>
          <span>« C'est quoi ton numéro Wave ? »</span>
          <span>Un QR différent par opérateur</span>
          <span>Erreurs de numéro ou de montant</span>
        </div>
        <div class="after">
          <h3>Avec Teliyaa</h3>
          <span>Une seule affiche au comptoir</span>
          <span>Le client choisit son app</span>
          <span>Le montant est déjà affiché</span>
        </div>
      </div>
    </section>

    <!-- Ce qui empêcherait l'affiche de marcher -->
    <RouterLink v-if="aliases && visibleCount === 0" to="/aliases/new" class="note warn">
      <Icon name="alert" />
      <span><strong>Ajoute d'abord un compte visible</strong> (Wave, Orange Money…) : sinon tes clients n'auront rien pour payer.</span>
    </RouterLink>
    <RouterLink v-if="profile.visibility === 'private'" to="/profile/visibility" class="note warn">
      <Icon name="lock" />
      <span><strong>Ton profil est privé</strong> : tes clients ne pourront pas ouvrir ta page. Passe-le à « Tout le monde » pour encaisser.</span>
    </RouterLink>

    <div class="section-head"><h2>Ton affiche de comptoir</h2></div>
    <label class="field">
      <span>Nom sur l'affiche</span>
      <input v-model="shopName" maxlength="40" placeholder="ex. Maquis Chez Awa" />
    </label>
    <div class="grid2">
      <label class="field">
        <span>Prix fixe <span class="muted">(facultatif)</span></span>
        <input v-model="amountText" inputmode="numeric" placeholder="ex. 2 500" />
      </label>
      <label class="field">
        <span>Pour quoi ? <span class="muted">(facultatif)</span></span>
        <input v-model="note" maxlength="60" placeholder="ex. Menu du jour" />
      </label>
    </div>
    <p v-if="amountError" class="error">{{ amountError }}</p>
    <small v-else class="muted">Sans prix, le client tape le montant lui-même. Avec un prix, fais une affiche par article ou par formule.</small>

    <!-- Aperçu (c'est aussi ce qui s'imprime) -->
    <div class="poster" aria-label="Aperçu de l'affiche">
      <div class="poster-inner">
        <span class="poster-brand"><img :src="logoUrl" alt="" width="22" height="22" /> Teliyaa</span>
        <strong class="poster-name">{{ shopName.trim() || profile.full_name }}</strong>
        <span class="muted">Scanne pour me payer</span>
        <img v-if="qr" :src="qr" alt="QR code de paiement" class="poster-qr" width="200" height="200" />
        <div v-else class="qr-placeholder" />
        <template v-if="amount">
          <span class="poster-amount">{{ formatAmount(amount) }}</span>
          <span v-if="note.trim()" class="muted">{{ note.trim() }}</span>
        </template>
        <span v-else class="poster-hint">Paie avec l'app de ton choix</span>
        <span class="poster-apps">
          <span v-for="a in POSTER_APPS" :key="a.label" class="poster-app" :style="{ '--c1': a.c1, '--c2': a.c2, '--ink-card': a.ink }">{{ a.label }}</span>
        </span>
        <span class="poster-link">{{ prettyLink(link) }}</span>
      </div>
      <p class="poster-foot">L'argent arrive directement sur mon compte · Pas besoin de compte Teliyaa pour payer</p>
    </div>

    <div class="grid2">
      <button type="button" class="btn" :disabled="busy" @click="saveImage"><Icon name="image" :size="18" /> {{ busy ? 'Image…' : 'Image' }}</button>
      <button type="button" class="btn secondary" @click="print"><Icon name="print" :size="18" /> Imprimer</button>
    </div>
    <div class="grid2">
      <button type="button" class="btn secondary" @click="share"><Icon name="share" :size="18" /> Partager le lien</button>
      <button type="button" class="btn secondary" @click="copyLink"><Icon name="copy" :size="18" /> Copier</button>
    </div>
    <small class="muted center">L'image se partage sur WhatsApp (statut, groupe client) ou s'imprime chez un imprimeur. Colle-la près de ta caisse.</small>
  </main>
</template>
