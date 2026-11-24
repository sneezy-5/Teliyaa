import type { Alias, ContactMatch, Profile, PublicProfile, SessionUser } from '../types';
import type { Api } from './types';

/**
 * Client de TON serveur (dossier server/). Le jeton de session est gardé sur le téléphone.
 * `baseUrl` vide = même adresse que le site (cas du site servi par le serveur).
 * App mobile : VITE_API_URL=https://teliyaa.com
 */
const TOKEN_KEY = 'teliyaa-session';

const unavailable = () => Promise.reject(new Error("Cette fonction n'est pas disponible dans cette version."));

export function createServerApi(baseUrl: string): Api {
  const base = baseUrl.replace(/\/$/, '');
  const listeners = new Set<(u: SessionUser | null) => void>();
  let token: string | null = readToken();

  function readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function setToken(value: string | null) {
    token = value;
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* stockage indisponible : la session dure le temps de la page */
    }
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch {
      throw new Error('Pas de connexion au serveur. Vérifie ton internet.');
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (res.status === 401 && token) {
      // Session expirée ou révoquée
      setToken(null);
      listeners.forEach((l) => l(null));
    }
    if (!res.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  }

  async function me(): Promise<{ user: SessionUser; profile: Profile | null } | null> {
    if (!token) return null;
    try {
      return await call<{ user: SessionUser; profile: Profile | null }>('GET', '/api/me');
    } catch {
      return null;
    }
  }

  return {
    mode: 'server',

    // ---------- Connexion ----------
    async getSessionUser() {
      return (await me())?.user ?? null;
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async sendOtp(phone) {
      await call('POST', '/api/auth/code', { phone });
    },

    async verifyOtp(phone, code) {
      const { token: t, user } = await call<{ token: string; user: SessionUser }>('POST', '/api/auth/verify', { phone, code: code.trim() });
      setToken(t);
      listeners.forEach((l) => l(user));
      return user;
    },

    async signOut() {
      await call('POST', '/api/auth/logout').catch(() => {});
      setToken(null);
      listeners.forEach((l) => l(null));
    },

    // ---------- Profil ----------
    async getMyProfile() {
      return (await me())?.profile ?? null;
    },

    saveMyProfile(input) {
      return call<Profile>('PUT', '/api/me/profile', input);
    },

    async isUsernameAvailable(username) {
      return (await call<{ available: boolean }>('GET', `/api/usernames/${encodeURIComponent(username)}`)).available;
    },

    // ---------- Comptes ----------
    listMyAliases() {
      return call<Alias[]>('GET', '/api/me/aliases');
    },

    saveAlias({ id, ...input }) {
      return id ? call<Alias>('PUT', `/api/me/aliases/${encodeURIComponent(id)}`, input) : call<Alias>('POST', '/api/me/aliases', input);
    },

    async deleteAlias(id) {
      await call('DELETE', `/api/me/aliases/${encodeURIComponent(id)}`);
    },

    // ---------- Profils publics, recherche, contacts ----------
    async getPublicProfile(username) {
      try {
        return await call<PublicProfile>('GET', `/api/profiles/${encodeURIComponent(username)}`);
      } catch (e) {
        if ((e as Error).message === 'Cette page n’existe pas.') return null;
        throw e;
      }
    },

    searchProfiles(query) {
      return call<PublicProfile[]>('GET', `/api/search?q=${encodeURIComponent(query)}`);
    },

    async findContacts(phoneHashes) {
      if (phoneHashes.length === 0) return [];
      return call<ContactMatch[]>('POST', '/api/contacts/match', { hashes: phoneHashes });
    },

    // ---------- Désactivé en v1 (lib/features.ts) ----------
    createRequest: unavailable,
    async listMyRequests() {
      return [];
    },
    setRequestStatus: unavailable,
    async getPublicRequest() {
      return null;
    },
    declarePayment: unavailable,
    async listMyPayments() {
      return { sent: [], received: [] };
    },
    setPaymentStatus: unavailable
  };
}
