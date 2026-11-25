<script setup lang="ts">
import { computed } from 'vue';
import { formatPhone } from '../lib/format';
import { copyText } from '../lib/links';
import { aliasDisplayName, getProvider } from '../lib/providers';
import { toast } from '../lib/toast';
import type { PublicAlias } from '../lib/types';
import Icon from './Icon.vue';

/**
 * Un compte présenté comme une carte de paiement : couleur de l'établissement, nom, alias en grand.
 * - `to` : toute la carte mène à cette page (ex. modifier le compte)
 * - le bouton « copier » reste toujours utilisable, même quand la carte est un lien
 */
const props = defineProps<{
  alias: PublicAlias & { visible?: boolean };
  to?: string;
}>();

const provider = computed(() => getProvider(props.alias.provider_id));
const title = computed(() => aliasDisplayName(props.alias));
/** Pour une banque, on rappelle le type sous le nom de la banque */
const subtitle = computed(() => {
  if (props.alias.provider_id === 'bank') return 'Banque';
  if (props.alias.label?.trim()) return provider.value.name;
  return props.alias.alias_type === 'phone' ? 'Numéro' : 'Alias';
});
const value = computed(() => (props.alias.alias_type === 'phone' ? formatPhone(props.alias.value) : props.alias.value));
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

async function copy() {
  toast((await copyText(props.alias.value)) ? 'Alias copié' : 'Copie impossible, recopie-le à la main');
}
</script>

<template>
  <article :class="['acct', { hidden: alias.visible === false }]" :style="style">
    <header class="acct-top">
      <span class="acct-badge" aria-hidden="true">{{ initials }}</span>
      <span class="grow">
        <strong class="acct-name">{{ title }}</strong>
        <span class="acct-sub">{{ subtitle }}</span>
      </span>
      <span v-if="alias.is_primary" class="acct-tag">Principal</span>
      <span v-if="alias.visible === false" class="acct-tag">Masqué</span>
    </header>
    <div class="acct-bottom">
      <span class="acct-value mono">{{ value }}</span>
      <button type="button" class="acct-copy" :aria-label="`Copier l'alias ${title}`" @click="copy">
        <Icon name="copy" :size="18" />
      </button>
    </div>
    <!-- Lien étiré sur toute la carte (le bouton copier passe au-dessus) -->
    <RouterLink v-if="to" :to="to" class="acct-link" :aria-label="`Modifier ${title}`" />
  </article>
</template>
