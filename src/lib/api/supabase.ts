import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { shortCode } from '../format';
import type { Alias, ContactMatch, Payment, PaymentRequest, Profile, PublicProfile, PublicRequest, SessionUser } from '../types';
import type { Api } from './types';

function toSessionUser(u: User | null | undefined): SessionUser | null {
  if (!u) return null;
  const phone = u.phone ? (u.phone.startsWith('+') ? u.phone : `+${u.phone}`) : '';
  return { id: u.id, phone };
}

function fail(error: { message: string } | null, fallback = 'Une erreur est survenue.'): void {
  if (error) throw new Error(translate(error.message) || fallback);
}

/** Messages Supabase les plus courants, en clair pour l'utilisateur. */
function translate(message: string): string {
  if (/duplicate key.*username/i.test(message)) return 'Ce pseudo est déjà pris.';
  if (/duplicate key.*aliases/i.test(message)) return 'Tu as déjà enregistré cet alias.';
  if (/Token has expired or is invalid/i.test(message)) return 'Code incorrect ou expiré.';
  if (/rate limit/i.test(message)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return message;
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  async function me(): Promise<SessionUser> {
    const { data } = await sb.auth.getUser();
    const u = toSessionUser(data.user);
    if (!u) throw new Error('Connecte-toi pour continuer.');
    return u;
  }

  return {
    mode: 'supabase',

    async getSessionUser() {
      const { data } = await sb.auth.getSession();
      return toSessionUser(data.session?.user);
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toSessionUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },

    async sendOtp(phone) {
      const { error } = await sb.auth.signInWithOtp({ phone });
      fail(error);
    },

    async verifyOtp(phone, code) {
      const { data, error } = await sb.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
      fail(error);
      const u = toSessionUser(data.user);
      if (!u) throw new Error('Connexion impossible.');
      return u;
    },

    // Ancienne version (Supabase abandonné) : pas de code PIN
    verifyPin: () => Promise.reject(new Error('Non disponible.')),
    setPin: () => Promise.reject(new Error('Non disponible.')),
    resetPin: () => Promise.reject(new Error('Non disponible.')),

    async signOut() {
      await sb.auth.signOut();
    },

    async deleteAccount() {
      throw new Error("Suppression du compte non disponible avec Supabase (backend abandonné, voir server/).");
    },

    async getMyProfile() {
      const u = await me();
      const { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
      fail(error);
      return (data as Profile | null) ?? null;
    },

    async saveMyProfile(input) {
      const u = await me();
      const { data, error } = await sb
        .from('profiles')
        .upsert({ id: u.id, phone: u.phone, ...input })
        .select('*')
        .single();
      fail(error);
      return data as Profile;
    },

    async isUsernameAvailable(username) {
      const { data, error } = await sb.rpc('username_available', { p_username: username });
      fail(error);
      return Boolean(data);
    },

    async listMyAliases() {
      const u = await me();
      const { data, error } = await sb
        .from('aliases')
        .select('*')
        .eq('owner_id', u.id)
        .order('is_primary', { ascending: false })
        .order('created_at');
      fail(error);
      return (data ?? []) as Alias[];
    },

    async saveAlias(input) {
      const u = await me();
      const row = { ...input, owner_id: u.id };
      const query = input.id
        ? sb.from('aliases').update(row).eq('id', input.id).select('*').single()
        : sb.from('aliases').insert(row).select('*').single();
      const { data, error } = await query;
      fail(error);
      return data as Alias;
    },

    async deleteAlias(id) {
      // Le passage de l'alias principal au suivant est géré par la base (trigger aliases_keep_primary).
      const { error } = await sb.from('aliases').delete().eq('id', id);
      fail(error);
    },

    async createRequest({ amount, note, alias_ids }) {
      const u = await me();
      // Le code est unique en base : en cas (rare) de collision, on retente.
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await sb
          .from('payment_requests')
          .insert({ code: shortCode(), owner_id: u.id, amount, note, alias_ids })
          .select('*')
          .single();
        if (!error) return data as PaymentRequest;
        if (!/duplicate key.*code/i.test(error.message)) fail(error);
      }
      throw new Error('Impossible de créer la demande, réessaie.');
    },

    async listMyRequests() {
      const u = await me();
      const { data, error } = await sb
        .from('payment_requests')
        .select('*')
        .eq('owner_id', u.id)
        .order('created_at', { ascending: false })
        .limit(100);
      fail(error);
      return (data ?? []) as PaymentRequest[];
    },

    async setRequestStatus(id, status) {
      const { error } = await sb.from('payment_requests').update({ status }).eq('id', id);
      fail(error);
    },

    async getPublicProfile(username) {
      const { data, error } = await sb.rpc('get_public_profile', { p_username: username });
      fail(error);
      return (data as PublicProfile | null) ?? null;
    },

    async getPublicRequest(code) {
      const { data, error } = await sb.rpc('get_public_request', { p_code: code });
      fail(error);
      return (data as PublicRequest | null) ?? null;
    },

    async searchProfiles(query) {
      const { data, error } = await sb.rpc('search_profiles', { p_query: query });
      fail(error);
      return (data ?? []) as PublicProfile[];
    },

    async findContacts(phoneHashes) {
      if (phoneHashes.length === 0) return [];
      const { data, error } = await sb.rpc('find_contacts', { p_hashes: phoneHashes });
      fail(error);
      return (data ?? []) as ContactMatch[];
    },

    async declarePayment(input) {
      const { data, error } = await sb.rpc('declare_payment', {
        p_recipient_username: input.recipientUsername,
        p_amount: input.amount,
        p_note: input.note,
        p_request_code: input.requestCode ?? null,
        p_provider_id: input.providerId ?? null,
        p_payer_name: input.payerName ?? null
      });
      fail(error);
      return data as Payment;
    },

    async listMyPayments() {
      const u = await me();
      const { data, error } = await sb
        .from('payments')
        .select('*')
        .or(`payer_id.eq.${u.id},recipient_id.eq.${u.id}`)
        .order('created_at', { ascending: false })
        .limit(200);
      fail(error);
      const rows = (data ?? []) as Payment[];
      return { sent: rows.filter((p) => p.payer_id === u.id), received: rows.filter((p) => p.recipient_id === u.id) };
    },

    async setPaymentStatus(id, status) {
      const { error } = await sb.rpc('set_payment_status', { p_id: id, p_status: status });
      fail(error);
    }
  };
}
