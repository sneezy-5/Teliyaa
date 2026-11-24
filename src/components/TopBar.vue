<script setup lang="ts">
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';

const props = defineProps<{ title: string; back?: string | true }>();
const router = useRouter();
const goBack = () => (props.back === true ? router.back() : router.push(props.back!));
</script>

<template>
  <header class="topbar">
    <button v-if="back" type="button" class="icon-btn" aria-label="Retour" @click="goBack">
      <Icon name="back" :size="22" />
    </button>
    <h1>{{ title }}</h1>
  </header>
</template>
