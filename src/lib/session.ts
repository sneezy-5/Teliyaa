import { reactive, readonly } from 'vue';
import { api } from './api';
import type { Profile, SessionUser } from './types';

/**
 * Session partagée par toute l'app (simple objet réactif, pas besoin de Pinia ici).
 * `ready` se résout quand on sait si quelqu'un est connecté.
 */
const state = reactive({
  loading: true,
  user: null as SessionUser | null,
  profile: null as Profile | null
});

async function load(user: SessionUser | null) {
  state.user = user;
  if (!user) {
    state.profile = null;
  } else {
    try {
      state.profile = await api.getMyProfile();
    } catch {
      state.profile = null;
    }
  }
  state.loading = false;
}

let readyPromise: Promise<void> | null = null;

export function initSession(): Promise<void> {
  if (!readyPromise) {
    readyPromise = api
      .getSessionUser()
      .then(load)
      .catch(() => load(null));
    api.onAuthChange((u) => {
      void load(u);
    });
  }
  return readyPromise;
}

export async function refreshProfile() {
  state.profile = await api.getMyProfile();
}

export const session = readonly(state);

/** Le PIN vient d'être tapé ou créé : le serveur donne maintenant accès aux données. */
export function markPinOk() {
  if (state.user) state.user = { ...state.user, has_pin: true, pin_ok: true };
}

/** À appeler juste après la vérification du code SMS (n'attend pas l'événement d'auth). */
export async function signedIn(user: SessionUser) {
  await load(user);
}
