<script setup lang="ts">
import { session } from '../lib/session';
</script>

<!-- Coquille des pages publiques : s'ouvre dans le navigateur, sans compte. -->
<template>
  <div class="public">
    <header class="public-top">
      <RouterLink to="/" class="logo small">Teliyaa</RouterLink>
      <span class="muted small">Pas besoin d'installer l'app</span>
    </header>
    <main class="page"><slot /></main>
    <footer v-if="!session.user" class="public-cta">
      <p class="small">Toi aussi, reçois de l'argent avec un seul lien.</p>
      <RouterLink to="/login" class="btn secondary">Créer mon lien gratuit</RouterLink>
    </footer>
  </div>
</template>
