<script setup lang="ts">
import { formatAmount } from '../lib/format';
import type { PublicProfile } from '../lib/types';
import Avatar from './Avatar.vue';
import VerifiedPill from './VerifiedPill.vue';

defineProps<{ profile: PublicProfile; intro: string; amount?: number; note?: string }>();
</script>

<template>
  <div class="center-col pay-head">
    <Avatar :name="profile.full_name" :size="56" />
    <span class="muted">{{ profile.full_name }} <VerifiedPill v-if="profile.verified" /> {{ intro }}</span>
    <span v-if="amount" class="amount-big">{{ formatAmount(amount) }}</span>
    <span v-if="note" class="muted">{{ note }}</span>
  </div>
</template>
