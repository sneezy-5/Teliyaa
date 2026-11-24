import { ref } from 'vue';

/** Petit message temporaire en bas de l'écran. */
export const toastMessage = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string) {
  toastMessage.value = message;
  clearTimeout(timer);
  timer = setTimeout(() => (toastMessage.value = null), 2400);
}
