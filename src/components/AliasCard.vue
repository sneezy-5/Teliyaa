<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatPhone } from '../lib/format';
import { copyText } from '../lib/links';
import { aliasDisplayName, getProvider, logoUrl } from '../lib/providers';
import { toast } from '../lib/toast';
import type { PublicAlias } from '../lib/types';
import Icon from './Icon.vue';
import ProviderBadge from './ProviderBadge.vue';

/**
 * Un compte présenté comme une carte de paiement : couleur de l'établissement, nom, alias en grand.
 * - `to` : toute la carte mène à cette page (ex. modifier le compte)
 * - le bouton « copier » reste toujours utilisable, même quand la carte est un lien
 */
const props = defineProps<{
  alias: PublicAlias & { visible?: boolean; account_phone_visible?: boolean };
  to?: string;
  /** Texte d'action (ex. « Payer ») : toute la carte devient un bouton qui émet `pay` */
  payLabel?: string;
  /** Apps proposées sous le compte (Wave, Orange Money…) : un toucher émet `payWith` avec l'app choisie */
  apps?: { id: string; name: string }[];
  /** App habituelle du payeur, mise en avant dans la rangée */
  highlightApp?: string | null;
}>();
const emit = defineEmits<{ pay: []; payWith: [providerId: string] }>();

const provider = computed(() => getProvider(props.alias.provider_id));
const title = computed(() => aliasDisplayName(props.alias));
/** Pour une banque, on rappelle le type sous le nom de la banque */
const subtitle = computed(() => {
  const named = Boolean(props.alias.name?.trim());
  if (props.alias.provider_id === 'bank') return named && props.alias.label?.trim() ? props.alias.label : 'Banque';
  if (named) return provider.value.name;
  return props.alias.alias_type === 'phone' ? 'Numéro' : 'Alias';
});
const value = computed(() => (props.alias.alias_type === 'phone' ? formatPhone(props.alias.value) : props.alias.value));
/** Numéro du compte, seulement s'il n'est pas déjà l'alias affiché */
const accountPhone = computed(() => {
  const p = props.alias.account_phone;
  return p && p !== props.alias.value ? formatPhone(p) : null;
});
const style = computed(() => ({
  '--c1': provider.value.card[0],
  '--c2': provider.value.card[1],
  '--ink-card': provider.value.cardInk ?? '#ffffff'
}));
const initials = computed(() => {
  if (props.alias.provider_id !== 'bank' || !props.alias.label) return provider.value.short;
  const words = props.alias.label.replace(/[()']/g, ' ').trim().split(/\s+/);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : words[0].slice(0, 2)).slice(0, 3).toUpperCase();
});

/** Logo de l'établissement (pas pour les banques), sinon initiales. On essaie chaque format. */
const logoAttempt = ref(0);
const logoSrc = computed(() => logoUrl(provider.value, logoAttempt.value));

async function copy() {
  toast((await copyText(props.alias.value)) ? 'Alias copié' : 'Copie impossible, recopie-le à la main');
}
</script>

<template>
  <article :class="['acct', { hidden: alias.visible === false }]" :style="style">
    <header class="acct-top">
      <span :class="['acct-badge', { 'has-logo': logoSrc }]" aria-hidden="true">
        <img v-if="logoSrc" :src="logoSrc" alt="" @error="logoAttempt++" />
        <template v-else>{{ initials }}</template>
      </span>
      <span class="grow">
        <strong class="acct-name">{{ title }}</strong>
        <span class="acct-sub">{{ subtitle }}<template v-if="accountPhone"> · {{ accountPhone }}<template v-if="alias.account_phone_visible === false"> (privé)</template></template></span>
      </span>
      <span v-if="alias.is_primary" class="acct-tag">Principal</span>
      <span v-if="alias.visible === false" class="acct-tag">Masqué</span>
    </header>
    <div class="acct-bottom">
      <span class="acct-value mono">{{ value }}</span>
      <span v-if="payLabel" class="acct-pay" aria-hidden="true">{{ payLabel }} <Icon name="open" :size="14" /></span>
      <button type="button" class="acct-copy" :aria-label="`Copier l'alias ${title}`" @click="copy">
        <Icon name="copy" :size="18" />
      </button>
    </div>
    <!-- Payer ce compte : on touche l'app avec laquelle on veut payer -->
    <div v-if="apps?.length" class="acct-apps" role="group" :aria-label="`Payer ${title} avec`">
      <button
        v-for="p in apps"
        :key="p.id"
        type="button"
        :class="['acct-app', { on: p.id === highlightApp }]"
        :aria-label="`Ouvrir ${p.name} pour payer ${title}`"
        @click="emit('payWith', p.id)"
      >
        <ProviderBadge :provider-id="p.id" />
        <span>{{ p.name }}</span>
      </button>
    </div>
    <!-- Lien ou bouton étiré sur toute la carte (le bouton copier passe au-dessus) -->
    <RouterLink v-if="to" :to="to" class="acct-link" :aria-label="`Modifier ${title}`" />
    <button v-else-if="payLabel" type="button" class="acct-link" :aria-label="`${payLabel} sur ${title}`" @click="emit('pay')" />
  </article>
</template>
