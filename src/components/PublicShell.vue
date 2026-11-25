<script setup lang="ts">
import { session } from '../lib/session';

const logoUrl = `${import.meta.env.BASE_URL}icone-512.png`;
</script>

<!-- Coquille des pages publiques : s'ouvre dans le navigateur, sans compte. -->
<template>
  <div class="public">
    <header class="public-top">
      <RouterLink to="/" class="logo small brand">
        <img :src="logoUrl" alt="" width="28" height="28" />
        Teliyaa
      </RouterLink>
      <span class="muted small">Pas besoin d'installer l'app</span>
    </header>
    <main class="page"><slot /></main>
    <footer v-if="!session.user" class="public-cta">
      <p class="small">Toi aussi, reçois de l'argent avec un seul lien.</p>
      <RouterLink to="/login" class="btn secondary">Créer mon lien gratuit</RouterLink>
    </footer>
  </div>
</template>
