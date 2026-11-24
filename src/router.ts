import { createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { FEATURES } from './lib/features';
import { initSession, session } from './lib/session';

const useHash = import.meta.env.VITE_ROUTER === 'hash' || import.meta.env.MODE === 'demo';

declare module 'vue-router' {
  interface RouteMeta {
    /** Connexion requise */
    private?: boolean;
    /** Accessible connecté mais sans profil (création du profil) */
    allowNoProfile?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('./pages/HomeOrWelcome.vue') },
  { path: '/login', component: () => import('./pages/Login.vue') },
  { path: '/onboarding', component: () => import('./pages/Onboarding.vue'), meta: { private: true, allowNoProfile: true } },

  { path: '/aliases/new', component: () => import('./pages/AliasForm.vue'), meta: { private: true } },
  { path: '/aliases/:id', component: () => import('./pages/AliasForm.vue'), meta: { private: true } },
  // Demandes de paiement : désactivées en v1 (voir lib/features.ts)
  ...(FEATURES.paymentRequests
    ? ([
        { path: '/requests/new', component: () => import('./pages/NewRequest.vue'), meta: { private: true } },
        { path: '/requests/:code', component: () => import('./pages/RequestDetail.vue'), meta: { private: true } },
        { path: '/r/:code', component: () => import('./pages/PublicRequest.vue') }
      ] as RouteRecordRaw[])
    : []),
  ...(FEATURES.paymentDeclarations
    ? ([{ path: '/activity', component: () => import('./pages/Activity.vue'), meta: { private: true } }] as RouteRecordRaw[])
    : []),
  { path: '/send', component: () => import('./pages/Send.vue'), meta: { private: true } },
  { path: '/send/:username', component: () => import('./pages/SendTo.vue'), meta: { private: true } },
  { path: '/profile', component: () => import('./pages/Profile.vue'), meta: { private: true } },

  // Pages publiques : sans compte
  { path: '/u/:username', component: () => import('./pages/PublicProfile.vue') },

  { path: '/:pathMatch(.*)*', redirect: '/' }
];

export const router = createRouter({
  history: useHash ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

/** Connecté + profil créé, sinon redirection vers la bonne étape. */
router.beforeEach(async (to) => {
  await initSession();
  if (!to.meta.private) return true;
  if (!session.user) return { path: '/login', query: { next: to.fullPath } };
  if (!session.profile && !to.meta.allowNoProfile) return '/onboarding';
  return true;
});
