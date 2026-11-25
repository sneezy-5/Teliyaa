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

-- Compteur anti-abus de la recherche de contacts
create table if not exists contact_lookups (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  lookups int not null check (lookups > 0),
  created_at timestamptz not null default now()
);
create index if not exists contact_lookups_user_idx on contact_lookups (user_id, created_at desc);
