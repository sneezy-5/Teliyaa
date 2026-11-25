/**
 * Appels du back-office (/api/admin/…). Le serveur refuse (404) tout compte absent de ADMIN_PHONES.
 */
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let token: string | null = null;
  try {
    token = localStorage.getItem('teliyaa-session');
  } catch {
    /* rien */
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(res.status === 404 ? 'Accès réservé.' : data.error || 'Erreur.');
  return data;
}

export type Count = { key: string; n: number };

export interface Overview {
  users: {
    total: number;
    new_today: number;
    new_7d: number;
    active_24h: number;
    active_7d: number;
    active_30d: number;
    blocked: number;
    without_pin: number;
  };
  content: { profiles: number; aliases: number; open_suspects: number };
  providers: Count[];
  devices: Count[];
  events24h: Count[];
  days: { day: string; signups: number; active: number }[];
}

export interface AdminUserRow {
  id: string;
  phone: string;
  created_at: string;
  last_seen_at: string | null;
  blocked_at: string | null;
  has_pin: boolean;
  username: string | null;
  full_name: string | null;
  aliases: number;
  device: string | null;
  last_ip: string | null;
  events_24h: number;
  open_suspects: number;
}

export interface AdminEvent {
  id: number;
  type: string;
  target: string | null;
  ip: string | null;
  device: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  user_id?: string | null;
  username?: string | null;
  phone?: string | null;
}

export interface Suspect {
  id: number;
  rule: string;
  label: string;
  subject: string;
  user_id: string | null;
  ip: string | null;
  detail: string;
  hits: number;
  day: string;
  status: 'open' | 'cleared' | 'blocked';
  updated_at: string;
  username?: string | null;
  full_name?: string | null;
  phone?: string | null;
  blocked_at?: string | null;
}

export interface AdminUserDetail {
  user: AdminUserRow & { blocked_reason: string | null; pin_failures: number; discoverable: boolean | null; findable_by_phone: boolean | null; favorite_provider: string | null };
  aliases: { provider_id: string; alias_type: string; value: string; label: string | null; is_primary: boolean; visible: boolean; created_at: string }[];
  sessions: { created_at: string; last_seen_at: string | null; last_ip: string | null; device: string | null; pin_ok: boolean; expires_at: string }[];
  events: AdminEvent[];
  suspects: Suspect[];
}

export const adminApi = {
  overview: () => call<Overview>('GET', '/api/admin/overview'),
  users: (q = '') => call<AdminUserRow[]>('GET', `/api/admin/users?q=${encodeURIComponent(q)}`),
  user: (id: string) => call<AdminUserDetail>('GET', `/api/admin/users/${encodeURIComponent(id)}`),
  suspects: (status: Suspect['status'] = 'open') => call<Suspect[]>('GET', `/api/admin/suspects?status=${status}`),
  setSuspect: (id: number, status: 'open' | 'cleared') => call('POST', `/api/admin/suspects/${id}`, { status }),
  block: (id: string, reason: string) => call('POST', `/api/admin/users/${encodeURIComponent(id)}/block`, { reason }),
  unblock: (id: string) => call('POST', `/api/admin/users/${encodeURIComponent(id)}/unblock`, {}),
  events: (filter: { type?: string; ip?: string } = {}) =>
    call<AdminEvent[]>('GET', `/api/admin/events?type=${encodeURIComponent(filter.type ?? '')}&ip=${encodeURIComponent(filter.ip ?? '')}`)
};

/** Libellés lisibles des événements */
export const EVENT_LABELS: Record<string, string> = {
  visit: 'Visite',
  signup: 'Inscription',
  login: 'Connexion',
  otp_request: 'Code WhatsApp demandé',
  otp_fail: 'Code WhatsApp faux',
  pin_fail: 'PIN faux',
  pin_lockout: 'Blocage PIN (5 erreurs)',
  pin_reset: 'PIN oublié → nouveau',
  search: 'Recherche',
  profile_view: 'Profil consulté',
  contacts_match: 'Contacts comparés',
  contacts_limit: 'Limite de contacts atteinte',
  alias_add: 'Compte ajouté',
  alias_update: 'Compte modifié',
  alias_delete: 'Compte supprimé',
  profile_update: 'Profil modifié',
  account_delete: 'Compte supprimé (utilisateur)',
  admin_block: 'Blocage (admin)',
  admin_unblock: 'Déblocage (admin)'
};
