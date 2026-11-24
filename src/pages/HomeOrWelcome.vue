<script setup lang="ts">
import { session } from '../lib/session';
import Home from './Home.vue';
import Welcome from './Welcome.vue';
import { useRouter } from 'vue-router';

const router = useRouter();
if (session.user && !session.profile) void router.replace('/onboarding');
</script>

<template>
  <Home v-if="session.user && session.profile" />
  <Welcome v-else-if="!session.user" />
</template>
