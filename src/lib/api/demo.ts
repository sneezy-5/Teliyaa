import { hashPhone, LOOKUP_BATCH } from '../contacts';
import { shortCode } from '../format';
import type { Alias, ContactMatch, Payment, PaymentRequest, Profile, PublicAlias, PublicProfile, SessionUser } from '../types';
import type { AliasInput, Api, DeclarePaymentInput } from './types';

/**
 * MODE DÉMO : tout est stocké dans le navigateur (localStorage).
 * Le code SMS est toujours 123456. Trois comptes d'exemple sont créés
 * (@mariam.s, @moussa, @fatou.t) pour tester la recherche et les paiements.
 */

export const DEMO_OTP = '123456';
const KEY = 'tonapp-demo-v1';

interface Db {
  users: SessionUser[];
  profiles: Profile[];
  aliases: Alias[];
  requests: PaymentRequest[];
  payments: Payment[];
  session: string | null;
  pins?: Record<string, string>;
}

const now = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function seed(): Db {
  const t = now();
  const mk = (id: string, phone: string, username: string, full_name: string): Profile => ({
    id, phone, username, full_name, verified: true, discoverable: true, findable_by_phone: true, favorite_provider: null
  });
  const al = (owner_id: string, provider_id: string, value: string, is_primary: boolean): Alias => ({
    id: uid(), owner_id, provider_id, alias_type: 'phone', value, label: null, is_primary, visible: true, created_at: t
  });
  return {
    users: [
      { id: 'demo-mariam', phone: '+2250700000001' },
      { id: 'demo-moussa', phone: '+2250500000004' },
      { id: 'demo-fatou', phone: '+2250500000003' }
    ],
    profiles: [
      mk('demo-mariam', '+2250700000001', 'mariam.s', 'Mariam Sanogo'),
      mk('demo-moussa', '+2250500000004', 'moussa', 'Moussa Diarra'),
      mk('demo-fatou', '+2250500000003', 'fatou.t', 'Fatou Traoré')
    ],
    aliases: [
      al('demo-mariam', 'wave', '+2250700000001', true),
      al('demo-mariam', 'orange-money', '+2250500000002', false),
      al('demo-moussa', 'mtn-momo', '+2250500000004', true),
      al('demo-fatou', 'orange-money', '+2250500000003', true)
    ],
    requests: [],
    payments: [],
    session: null
  };
}

let memory: Db | null = null;

function load(): Db {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as Db) : seed();
  } catch {
    memory = seed();
  }
  return memory;
}

function save(db: Db) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* stockage indisponible : on reste en mémoire */
  }
}

/** Copie : comme avec un vrai serveur, l'appelant ne reçoit jamais les objets stockés. */
const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const listeners = new Set<(u: SessionUser | null) => void>();

/** Démo : PIN gardé tel quel dans le navigateur (le vrai serveur ne garde qu'une empreinte) */
let demoPinOk = false;
const pins = (db: Db) => (db.pins ??= {});

function currentUser(db: Db): SessionUser | null {
  const u = db.users.find((x) => x.id === db.session);
  return u ? { id: u.id, phone: u.phone, has_pin: Boolean(pins(db)[u.id]), pin_ok: demoPinOk } : null;
}

function demoPinCheck(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error('Le code doit faire 4 chiffres.');
}

function requireUser(db: Db): SessionUser {
  const u = currentUser(db);
  if (!u) throw new Error('Connecte-toi pour continuer.');
  return u;
}

function toPublicAlias(a: Alias): PublicAlias {
  return { id: a.id, provider_id: a.provider_id, alias_type: a.alias_type, value: a.value, label: a.label, is_primary: a.is_primary };
}

function sortAliases<T extends { is_primary: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

function publicProfile(db: Db, p: Profile, onlyIds?: string[]): PublicProfile {
  const aliases = db.aliases.filter(
    (a) => a.owner_id === p.id && a.visible && (!onlyIds || onlyIds.length === 0 || onlyIds.includes(a.id))
  );
  return { username: p.username, full_name: p.full_name, verified: p.verified, aliases: sortAliases(aliases).map(toPublicAlias) };
}

const demoUnavailable = () => Promise.reject(new Error("Pas disponible en mode démo."));

export function resetDemo() {
  save(seed());
  listeners.forEach((l) => l(null));
}

export const demoApi: Api = {
  mode: 'demo',

  async getSessionUser() {
    return clone(currentUser(load()));
  },

  onAuthChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  async sendOtp() {
    await wait(400);
  },

  async verifyPin(pin) {
    const db = load();
    const u = requireUser(db);
    if (pins(db)[u.id] !== pin) throw new Error('Code incorrect.');
    demoPinOk = true;
  },

  async setPin(pin, current) {
    demoPinCheck(pin);
    const db = load();
    const u = requireUser(db);
    if (pins(db)[u.id] && pins(db)[u.id] !== current) throw new Error('Code actuel incorrect.');
    pins(db)[u.id] = pin;
    demoPinOk = true;
    save(db);
  },

  async resetPin(pin) {
    demoPinCheck(pin);
    const db = load();
    pins(db)[requireUser(db).id] = pin;
    demoPinOk = true;
    save(db);
  },

  async verifyOtp(phone, code) {
    await wait(300);
    if (code.trim() !== DEMO_OTP) throw new Error(`Code incorrect. En mode démo, le code est ${DEMO_OTP}.`);
    const db = load();
    let user = db.users.find((u) => u.phone === phone);
    if (!user) {
      user = { id: uid(), phone };
      db.users.push(user);
    }
    db.session = user.id;
    demoPinOk = false;
    save(db);
    const me = currentUser(db)!;
    listeners.forEach((l) => l(clone(me)));
    return clone(me);
  },

  async signOut() {
    const db = load();
    db.session = null;
    demoPinOk = false;
    save(db);
    listeners.forEach((l) => l(null));
  },

  async deleteAccount() {
    const db = load();
    const u = requireUser(db);
    db.aliases = db.aliases.filter((a) => a.owner_id !== u.id);
    db.profiles = db.profiles.filter((p) => p.id !== u.id);
    db.users = db.users.filter((x) => x.id !== u.id);
    db.session = null;
    save(db);
    listeners.forEach((l) => l(null));
  },

  async getMyProfile() {
    const db = load();
    const u = currentUser(db);
    return clone(u ? db.profiles.find((p) => p.id === u.id) ?? null : null);
  },

  async saveMyProfile(input) {
    await wait();
    const db = load();
    const u = requireUser(db);
    const taken = db.profiles.some((p) => p.username === input.username && p.id !== u.id);
    if (taken) throw new Error('Ce pseudo est déjà pris.');
    const existing = db.profiles.find((p) => p.id === u.id);
    const profile: Profile = {
      id: u.id,
      phone: u.phone,
      verified: true,
      discoverable: existing?.discoverable ?? true,
      findable_by_phone: existing?.findable_by_phone ?? true,
      favorite_provider: existing?.favorite_provider ?? null,
      ...existing,
      ...input
    };
    db.profiles = [...db.profiles.filter((p) => p.id !== u.id), profile];
    save(db);
    return clone(profile);
  },

  async isUsernameAvailable(username) {
    const db = load();
    const me = db.session;
    return !db.profiles.some((p) => p.username === username && p.id !== me);
  },

  // Profil privé : pas en mode démo (tout reste public)
  async getSharing() {
    return { visibility: 'public', grants: [], links: [] };
  },
  setVisibility: demoUnavailable,
  addGrant: demoUnavailable,
  removeGrant: demoUnavailable,
  createShareLink: demoUnavailable,
  deleteShareLink: demoUnavailable,
  async getSharedProfile() {
    return null;
  },

  async listMyAliases() {
    const db = load();
    const u = requireUser(db);
    return clone(sortAliases(db.aliases.filter((a) => a.owner_id === u.id)));
  },

  async saveAlias(input: AliasInput) {
    await wait();
    const db = load();
    const u = requireUser(db);
    const mine = db.aliases.filter((a) => a.owner_id === u.id);
    const duplicate = mine.some((a) => a.value === input.value && a.provider_id === input.provider_id && a.id !== input.id);
    if (duplicate) throw new Error('Tu as déjà enregistré cet alias.');
    const isPrimary = input.is_primary || mine.filter((a) => a.id !== input.id).length === 0;
    if (isPrimary) db.aliases.forEach((a) => { if (a.owner_id === u.id) a.is_primary = false; });
    const existing = input.id ? db.aliases.find((a) => a.id === input.id && a.owner_id === u.id) : undefined;
    const alias: Alias = {
      id: existing?.id ?? uid(),
      owner_id: u.id,
      created_at: existing?.created_at ?? now(),
      provider_id: input.provider_id,
      alias_type: input.alias_type,
      value: input.value,
      label: input.label,
      visible: input.visible,
      is_primary: isPrimary
    };
    db.aliases = [...db.aliases.filter((a) => a.id !== alias.id), alias];
    save(db);
    return clone(alias);
  },

  async deleteAlias(id) {
    const db = load();
    const u = requireUser(db);
    const removed = db.aliases.find((a) => a.id === id && a.owner_id === u.id);
    db.aliases = db.aliases.filter((a) => !(a.id === id && a.owner_id === u.id));
    if (removed?.is_primary) {
      const next = db.aliases.find((a) => a.owner_id === u.id);
      if (next) next.is_primary = true;
    }
    save(db);
  },

  async createRequest({ amount, note, alias_ids }) {
    await wait();
    const db = load();
    const u = requireUser(db);
    const created = new Date();
    const req: PaymentRequest = {
      id: uid(),
      code: shortCode(),
      owner_id: u.id,
      amount,
      note,
      alias_ids,
      status: 'open',
      payer_name: null,
      created_at: created.toISOString(),
      expires_at: new Date(created.getTime() + 30 * 864e5).toISOString()
    };
    db.requests.push(req);
    save(db);
    return clone(req);
  },

  async listMyRequests() {
    const db = load();
    const u = requireUser(db);
    return clone(db.requests.filter((r) => r.owner_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },

  async setRequestStatus(id, status) {
    const db = load();
    const u = requireUser(db);
    const r = db.requests.find((x) => x.id === id && x.owner_id === u.id);
    if (r) r.status = status;
    save(db);
  },

  async getPublicProfile(username) {
    await wait(80);
    const db = load();
    const p = db.profiles.find((x) => x.username === username);
    return p ? publicProfile(db, p) : null;
  },

  async getPublicRequest(code) {
    await wait(80);
    const db = load();
    const r = db.requests.find((x) => x.code === code.toUpperCase());
    const p = r && db.profiles.find((x) => x.id === r.owner_id);
    if (!r || !p) return null;
    return clone({ code: r.code, amount: r.amount, note: r.note, status: r.status, expires_at: r.expires_at, profile: publicProfile(db, p, r.alias_ids) });
  },

  async searchProfiles(query) {
    await wait(80);
    const db = load();
    const q = query.trim().replace(/^@/, '').toLowerCase();
    if (q.length < 2) return [];
    return db.profiles
      .filter((p) => p.discoverable && p.id !== db.session && (p.username.includes(q) || p.full_name.toLowerCase().includes(q)))
      .slice(0, 10)
      .map((p) => publicProfile(db, p));
  },

  async findContacts(phoneHashes) {
    await wait(150);
    const db = load();
    requireUser(db);
    if (phoneHashes.length > LOOKUP_BATCH) throw new Error(`Trop de contacts en une fois (${LOOKUP_BATCH} maximum).`);
    const wanted = new Set(phoneHashes.map((h) => h.toLowerCase()));
    const out: ContactMatch[] = [];
    for (const p of db.profiles) {
      // Anciennes données de démo sans le champ : trouvable par défaut, comme en base.
      if (p.id === db.session || p.findable_by_phone === false) continue;
      const phones = new Set([
        p.phone,
        ...db.aliases.filter((a) => a.owner_id === p.id && a.visible && a.alias_type === 'phone').map((a) => a.value)
      ]);
      for (const phone of phones) {
        const hash = await hashPhone(phone);
        if (wanted.has(hash)) out.push({ hash, profile: publicProfile(db, p) });
      }
    }
    return clone(out);
  },

  async declarePayment(input: DeclarePaymentInput) {
    await wait();
    const db = load();
    const me = currentUser(db);
    const recipient = db.profiles.find((p) => p.username === input.recipientUsername);
    if (!recipient) throw new Error('Destinataire introuvable.');
    const myProfile = me ? db.profiles.find((p) => p.id === me.id) : undefined;
    const payment: Payment = {
      id: uid(),
      payer_id: me?.id ?? null,
      payer_name: myProfile ? `@${myProfile.username}` : input.payerName?.trim() || 'Quelqu’un',
      recipient_id: recipient.id,
      recipient_username: recipient.username,
      amount: input.amount,
      note: input.note,
      request_code: input.requestCode ?? null,
      provider_id: input.providerId ?? null,
      status: 'declared',
      created_at: now()
    };
    db.payments.push(payment);
    if (input.requestCode) {
      const r = db.requests.find((x) => x.code === input.requestCode && x.owner_id === recipient.id);
      if (r && r.status === 'open') {
        r.status = 'declared';
        r.payer_name = payment.payer_name;
      }
    }
    save(db);
    return clone(payment);
  },

  async listMyPayments() {
    const db = load();
    const u = requireUser(db);
    const byDate = (a: Payment, b: Payment) => b.created_at.localeCompare(a.created_at);
    return clone({
      sent: db.payments.filter((p) => p.payer_id === u.id).sort(byDate),
      received: db.payments.filter((p) => p.recipient_id === u.id).sort(byDate)
    });
  },

  async setPaymentStatus(id, status) {
    const db = load();
    const u = requireUser(db);
    const p = db.payments.find((x) => x.id === id && x.recipient_id === u.id);
    if (!p) return;
    p.status = status;
    if (p.request_code) {
      const r = db.requests.find((x) => x.code === p.request_code && x.owner_id === u.id);
      if (r) r.status = status === 'confirmed' ? 'paid' : 'open';
    }
    save(db);
  }
};
