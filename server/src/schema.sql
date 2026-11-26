-- =====================================================================
-- Teliyaa — base PostgreSQL (16+). Exécuté automatiquement au démarrage du serveur.
-- Toutes les instructions peuvent être relancées sans rien casser.
-- =====================================================================

-- Comptes : un numéro vérifié par SMS = un compte
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  created_at timestamptz not null default now()
);

-- Codes SMS en attente (un seul par numéro ; stocké sous forme d'empreinte)
create table if not exists otp_codes (
  phone text primary key,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Historique des envois de SMS (limites anti-abus)
create table if not exists otp_sends (
  id bigint generated always as identity primary key,
  phone text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists otp_sends_phone_idx on otp_sends (phone, created_at desc);

-- Sessions : le jeton n'est jamais stocké en clair, seulement son empreinte
create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);

-- Profil public : nom + @pseudo
create table if not exists profiles (
  id uuid primary key references users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,18}[a-z0-9]$'),
  full_name text not null check (char_length(full_name) between 2 and 60),
  phone text not null,
  verified boolean not null default true,
  discoverable boolean not null default true,
  findable_by_phone boolean not null default true,
  favorite_provider text,
  created_at timestamptz not null default now()
);

-- Alias PI-SPI (Wave, Orange Money, banque…)
create table if not exists aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  provider_id text not null,
  alias_type text not null check (alias_type in ('phone', 'address')),
  value text not null check (char_length(value) between 4 and 64),
  label text check (label is null or char_length(label) <= 40),
  is_primary boolean not null default false,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, provider_id, value)
);
create index if not exists aliases_owner_idx on aliases (owner_id);

-- Contacts du répertoire : on compare des empreintes SHA-256 de numéros E.164.
-- (`decode(…, 'escape')` : il faut une fonction « immutable » pour une colonne calculée.)
alter table profiles add column if not exists phone_hash text
  generated always as (encode(sha256(decode(replace(phone, '\', '\\'), 'escape')), 'hex')) stored;
create index if not exists profiles_phone_hash_idx on profiles (phone_hash);

alter table aliases add column if not exists value_hash text
  generated always as (
    case when alias_type = 'phone' then encode(sha256(decode(replace(value, '\', '\\'), 'escape')), 'hex') end
  ) stored;
create index if not exists aliases_value_hash_idx on aliases (value_hash) where value_hash is not null;

-- Code PIN (4 chiffres) : empreinte scrypt seulement, jamais le code.
-- Une session n'a accès aux données qu'après le bon PIN (pin_ok), même avec le code WhatsApp.
alter table users add column if not exists pin_hash text;
alter table users add column if not exists pin_failures int not null default 0;
alter table sessions add column if not exists pin_ok boolean not null default false;

-- ---------- Sécurité et suivi (back-office) ----------
-- Dernière visite, appareil et IP (mis à jour au plus toutes les 30 min)
alter table users add column if not exists last_seen_at timestamptz;
alter table users add column if not exists blocked_at timestamptz;
alter table users add column if not exists blocked_reason text;
alter table sessions add column if not exists last_seen_at timestamptz;
alter table sessions add column if not exists last_ip text;
alter table sessions add column if not exists device text;

-- Journal d'activité (anti-fraude), conservé 30 jours.
-- `target` = ce qui est visé : @pseudo consulté, texte cherché, numéro qui demande un code…
create table if not exists events (
  id bigint generated always as identity primary key,
  user_id uuid references users (id) on delete set null,
  type text not null,
  target text,
  ip text,
  device text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on events (created_at desc);
create index if not exists events_user_idx on events (user_id, created_at desc);
create index if not exists events_type_idx on events (type, created_at desc);

-- Comportements suspects détectés automatiquement (une ligne par règle, personne et jour)
create table if not exists suspects (
  id bigint generated always as identity primary key,
  rule text not null,
  subject text not null,
  user_id uuid references users (id) on delete set null,
  ip text,
  detail text not null,
  hits int not null,
  day date not null default current_date,
  status text not null default 'open' check (status in ('open', 'cleared', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule, subject, day)
);
create index if not exists suspects_status_idx on suspects (status, updated_at desc);

-- ---------- Qui peut voir mon profil ----------
-- public : tout le monde avec le lien ; private : seulement les personnes choisies et les liens secrets
alter table profiles add column if not exists visibility text not null default 'public';
do $$ begin
  alter table profiles add constraint profiles_visibility_check check (visibility in ('public', 'private'));
exception when duplicate_object then null;
end $$;

-- Personnes autorisées à voir un profil privé (comptes Teliyaa), avec une date de fin facultative
create table if not exists profile_grants (
  owner_id uuid not null references profiles (id) on delete cascade,
  viewer_id uuid not null references profiles (id) on delete cascade,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);
create index if not exists profile_grants_viewer_idx on profile_grants (viewer_id);

-- Liens secrets (teliyaa.com/p/…) : ouvrent le profil sans compte, jusqu'à leur date de fin.
-- Le jeton est gardé tel quel pour que son propriétaire puisse le recopier : il ne donne accès
-- qu'à ce que montre déjà la page du profil (nom et comptes visibles).
create table if not exists profile_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists profile_links_owner_idx on profile_links (owner_id);

-- ---------- Nom et numéro de chaque compte ----------
-- Une personne peut avoir plusieurs Wave, Orange Money… : chaque compte a son nom (« Wave perso », « Boutique »)
-- et, pour un portefeuille mobile, le numéro auquel il est rattaché.
-- `label` garde le nom de la banque pour les comptes bancaires.
alter table aliases add column if not exists name text;
alter table aliases add column if not exists account_phone text;
-- Le numéro du compte reste privé tant que la personne ne choisit pas de l'afficher
alter table aliases add column if not exists account_phone_visible boolean not null default false;
do $$ begin
  alter table aliases add constraint aliases_name_check check (name is null or char_length(name) <= 40);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table aliases add constraint aliases_account_phone_check check (account_phone is null or account_phone ~ '^\+[0-9]{8,15}$');
exception when duplicate_object then null;
end $$;
-- Ancien « nom affiché » d'un compte non bancaire → devient son nom (une seule fois)
update aliases set name = label, label = null where provider_id <> 'bank' and label is not null and name is null;

-- Compteur anti-abus de la recherche de contacts
create table if not exists contact_lookups (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  lookups int not null check (lookups > 0),
  created_at timestamptz not null default now()
);
create index if not exists contact_lookups_user_idx on contact_lookups (user_id, created_at desc);
