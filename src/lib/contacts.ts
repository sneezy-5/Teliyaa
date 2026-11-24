import { COUNTRIES } from './format';
import type { ContactMatch, PublicAlias } from './types';

/**
 * Retrouver ses contacts sur tonapp, comme WhatsApp.
 * - Le téléphone met chaque numéro au format international (+225…).
 * - Seule une empreinte SHA-256 de chaque numéro part vers le serveur.
 * - Le serveur répond avec les profils qui acceptent d'être trouvés par leur numéro, et leurs alias visibles.
 * - La liste (noms du répertoire compris) reste sur ce téléphone, jamais sur le serveur.
 *
 * Deux sources de contacts :
 * - app installée (Capacitor) : tout le répertoire, relu à chaque ouverture → `syncAddressBook`
 * - navigateur (Chrome Android) : contacts cochés par l'utilisateur → `resolveContacts` + `mergeContacts`
 */

export interface RawContact {
  name: string;
  phones: string[];
}

/** Ce qu'on garde d'un profil trouvé : de quoi afficher ses comptes sans nouvelle requête. */
export interface ContactMatchInfo {
  username: string;
  full_name: string;
  verified: boolean;
  aliases: PublicAlias[];
}

export interface SavedContact {
  /** Nom tel qu'il est écrit dans le répertoire */
  name: string;
  /** Numéro E.164 (+2250700000001) */
  phone: string;
  /** Profil tonapp trouvé, ou null s'il n'est pas (encore) inscrit */
  match: ContactMatchInfo | null;
}

/** Nombre maximum d'empreintes envoyées en une requête (même limite côté serveur). */
export const LOOKUP_BATCH = 500;

/** Le répertoire complet est revérifié au plus une fois par jour ; entre-temps, seuls les nouveaux numéros partent. */
export const FULL_SYNC_MS = 24 * 3600 * 1000;

/** Indicatif du pays de l'utilisateur, déduit de son numéro de connexion. */
export function countryCodeOf(phone: string | null | undefined): string {
  return COUNTRIES.find((c) => phone?.startsWith(c.code))?.code ?? COUNTRIES[0].code;
}

/**
 * Numéro du répertoire → E.164, ou null s'il n'est pas un numéro UEMOA valide.
 * Accepte "07 00 00 00 01", "+225 07…", "00225 07…", "225 07…".
 */
export function normalizeContactPhone(raw: string, defaultCode: string): string | null {
  let s = raw.trim().replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  const withCode = (digits: string) =>
    COUNTRIES.find((c) => digits.startsWith(c.code.slice(1)) && digits.length === c.code.length - 1 + c.digits);

  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    return withCode(digits) ? `+${digits}` : null;
  }
  const local = COUNTRIES.find((c) => c.code === defaultCode);
  if (local && s.length === local.digits) return `${local.code}${s}`;
  return withCode(s) ? `+${s}` : null;
}

/** Empreinte SHA-256 (hexadécimal) d'un numéro E.164. Identique au calcul fait par la base. */
export async function hashPhone(e164: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('La recherche de contacts demande une connexion sécurisée (https).');
  }
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(e164));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Sélecteur de contacts du navigateur (Chrome Android) ----------

interface BrowserContact {
  name?: string[];
  tel?: string[];
}
interface ContactsManager {
  select(props: string[], options?: { multiple?: boolean }): Promise<BrowserContact[]>;
}

/** Vrai si le navigateur sait ouvrir le répertoire (Chrome Android). Faux sur iPhone et ordinateur. */
export function canPickContacts(): boolean {
  return typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
}

/** Ouvre le répertoire : l'utilisateur coche les contacts à partager. */
export async function pickContacts(): Promise<RawContact[]> {
  const manager = (navigator as unknown as { contacts: ContactsManager }).contacts;
  const picked = await manager.select(['name', 'tel'], { multiple: true });
  return picked.map((c) => ({ name: c.name?.[0]?.trim() ?? '', phones: c.tel ?? [] }));
}

// ---------- Comparaison avec le serveur ----------

interface PreparedContact {
  name: string;
  phones: string[];
}

/** Garde les contacts qui ont au moins un numéro UEMOA valide, au format E.164. */
function prepareContacts(contacts: RawContact[], defaultCode: string): { entries: PreparedContact[]; phones: string[]; skipped: number } {
  const entries: PreparedContact[] = [];
  const all = new Set<string>();
  let skipped = 0;
  for (const c of contacts) {
    const phones = [...new Set(c.phones.map((p) => normalizeContactPhone(p, defaultCode)).filter((p): p is string => !!p))];
    if (phones.length === 0) {
      skipped++;
      continue;
    }
    entries.push({ name: c.name, phones });
    phones.forEach((p) => all.add(p));
  }
  return { entries, phones: [...all], skipped };
}

const toInfo = (p: ContactMatch['profile']): ContactMatchInfo => ({
  username: p.username,
  full_name: p.full_name,
  verified: p.verified,
  aliases: p.aliases
});

/** Envoie les empreintes par lots et renvoie numéro → profil trouvé. */
async function lookupPhones(phones: string[], find: (hashes: string[]) => Promise<ContactMatch[]>): Promise<Map<string, ContactMatchInfo>> {
  const byHash = new Map<string, string>();
  for (const p of phones) byHash.set(await hashPhone(p), p);
  const hashes = [...byHash.keys()];
  const found = new Map<string, ContactMatchInfo>();
  for (let i = 0; i < hashes.length; i += LOOKUP_BATCH) {
    for (const m of await find(hashes.slice(i, i + LOOKUP_BATCH))) {
      const phone = byHash.get(m.hash.toLowerCase());
      if (phone && !found.has(phone)) found.set(phone, toInfo(m.profile));
    }
  }
  return found;
}

/** Un contact par personne : un inscrit n'apparaît qu'une fois, même s'il est enregistré sous deux noms. */
function buildList(entries: PreparedContact[], matchOf: (phone: string) => ContactMatchInfo | null | undefined): SavedContact[] {
  const seenUsers = new Set<string>();
  const seenPhones = new Set<string>();
  const result: SavedContact[] = [];
  for (const e of entries) {
    const hit = e.phones.find((p) => matchOf(p));
    const phone = hit ?? e.phones[0];
    const match = hit ? matchOf(hit)! : null;
    if (match && seenUsers.has(match.username)) continue;
    if (!match && seenPhones.has(phone)) continue;
    if (match) seenUsers.add(match.username);
    seenPhones.add(phone);
    result.push({ name: e.name || match?.full_name || phone, phone, match });
  }
  return sortContacts(result);
}

/**
 * Contacts choisis à la main (navigateur) : tout est vérifié auprès du serveur.
 * `skipped` = contacts sans numéro valide.
 */
export async function resolveContacts(
  contacts: RawContact[],
  defaultCode: string,
  find: (hashes: string[]) => Promise<ContactMatch[]>
): Promise<{ contacts: SavedContact[]; skipped: number }> {
  const { entries, phones, skipped } = prepareContacts(contacts, defaultCode);
  const found = await lookupPhones(phones, find);
  return { contacts: buildList(entries, (p) => found.get(p) ?? null), skipped };
}

/** Mémoire de la synchronisation : numéro → profil trouvé (ou null), et date de la dernière vérification complète. */
export interface SyncCache {
  lastFull: string | null;
  index: Record<string, ContactMatchInfo | null>;
}

export const emptySyncCache = (): SyncCache => ({ lastFull: null, index: {} });

/**
 * Tout le répertoire (app installée). À chaque ouverture, seuls les numéros jamais vus partent au serveur ;
 * une fois par jour, tout est revérifié pour découvrir les contacts inscrits entre-temps.
 * Les contacts supprimés du répertoire disparaissent de la liste.
 */
export async function syncAddressBook(
  contacts: RawContact[],
  defaultCode: string,
  cache: SyncCache,
  find: (hashes: string[]) => Promise<ContactMatch[]>,
  now: Date = new Date()
): Promise<{ contacts: SavedContact[]; cache: SyncCache; skipped: number; queried: number }> {
  const { entries, phones, skipped } = prepareContacts(contacts, defaultCode);
  const full = !cache.lastFull || now.getTime() - Date.parse(cache.lastFull) >= FULL_SYNC_MS;
  const toQuery = full ? phones : phones.filter((p) => !(p in cache.index));
  const asked = new Set(toQuery);
  const found = toQuery.length ? await lookupPhones(toQuery, find) : new Map<string, ContactMatchInfo>();

  const index: SyncCache['index'] = {};
  for (const p of phones) index[p] = asked.has(p) ? found.get(p) ?? null : cache.index[p] ?? null;

  return {
    contacts: buildList(entries, (p) => index[p]),
    cache: { lastFull: full ? now.toISOString() : cache.lastFull, index },
    skipped,
    queried: toQuery.length
  };
}

/** Ajoute les nouveaux contacts à la liste existante (le plus récent l'emporte pour un même numéro). */
export function mergeContacts(previous: SavedContact[], added: SavedContact[]): SavedContact[] {
  const phones = new Set(added.map((c) => c.phone));
  const users = new Set(added.flatMap((c) => (c.match ? [c.match.username] : [])));
  const kept = previous.filter((c) => !phones.has(c.phone) && !(c.match && users.has(c.match.username)));
  return sortContacts([...kept, ...added]);
}

function sortContacts(list: SavedContact[]): SavedContact[] {
  return [...list].sort((a, b) => Number(!!b.match) - Number(!!a.match) || a.name.localeCompare(b.name, 'fr'));
}

// ---------- Stockage local (sur ce téléphone uniquement) ----------

const listKey = (userId: string) => `tonapp-contacts-v1:${userId}`;
const syncKey = (userId: string) => `tonapp-contacts-sync-v1:${userId}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown, empty: boolean): void {
  try {
    if (empty) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : la liste reste à l'écran seulement */
  }
}

export function loadSavedContacts(userId: string): SavedContact[] {
  // Listes enregistrées avant l'ajout des alias : on complète pour l'affichage.
  return readJson<SavedContact[]>(listKey(userId), []).map((c) => (c.match ? { ...c, match: { ...c.match, aliases: c.match.aliases ?? [] } } : c));
}

export function storeContacts(userId: string, list: SavedContact[]): void {
  writeJson(listKey(userId), list, list.length === 0);
}

export function loadSyncCache(userId: string): SyncCache {
  return readJson<SyncCache>(syncKey(userId), emptySyncCache());
}

export function storeSyncCache(userId: string, cache: SyncCache | null): void {
  writeJson(syncKey(userId), cache, cache === null);
}

/** Lien WhatsApp vers ce contact, avec un message d'invitation et mon lien de paiement. */
export function inviteLink(phone: string, myLink: string): string {
  const text =
    `Salut ! J'utilise Teliyaa pour regrouper mes comptes Wave, Orange Money, banque… ` +
    `Inscris-toi pour qu'on s'envoie de l'argent plus facilement : ${myLink}`;
  return `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
}
