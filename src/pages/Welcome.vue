<script setup lang="ts">
import { api } from '../lib/api';
import { DEMO_OTP } from '../lib/api/demo';

const logoUrl = `${import.meta.env.BASE_URL}icone-512.png`;
</script>

<template>
  <main class="welcome">
    <div />
    <div class="stack">
      <div class="welcome-brand">
        <img :src="logoUrl" alt="" width="64" height="64" class="welcome-icon" />
        <span class="logo">Teliyaa</span>
      </div>
      <p class="lead">Tous tes alias PI-SPI au même endroit. Un seul lien pour te faire payer, depuis n'importe quelle app.</p>
    </div>
    <div class="stack">
      <p v-if="api.mode === 'demo'" class="demo-banner">
        Mode démo : tout reste sur ce téléphone. Code SMS : <strong>{{ DEMO_OTP }}</strong>
      </p>
      <RouterLink to="/login" class="btn light">Créer mon compte</RouterLink>
      <RouterLink to="/login" class="btn ghost light-text">J'ai déjà un compte</RouterLink>
      <RouterLink to="/confidentialite" class="small light-text center" style="opacity: 0.8">Confidentialité</RouterLink>
    </div>
  </main>
</template>
