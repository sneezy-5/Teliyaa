-- =====================================================================
-- tonapp — schéma Supabase (phase 1)
-- À coller dans Supabase > SQL Editor, puis « Run ».
-- Principe : chacun ne lit / modifie que ses lignes (Row Level Security).
-- Le public (sans compte) passe uniquement par les fonctions get_public_*.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9][a-z0-9._-]{1,18}[a-z0-9]$'),
  full_name text not null check (char_length(full_name) between 2 and 60),
  phone text not null default '',
  verified boolean not null default true,
  discoverable boolean not null default true,
  favorite_provider text,
  created_at timestamptz not null default now()
);

create table if not exists public.aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  provider_id text not null,
  alias_type text not null check (alias_type in ('phone', 'address')),
  value text not null check (char_length(value) between 4 and 64),
  label text check (label is null or char_length(label) <= 40),
  is_primary boolean not null default false,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, provider_id, value)
);
create index if not exists aliases_owner_idx on public.aliases (owner_id);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  amount bigint not null check (amount > 0 and amount <= 10000000),
  note text not null default '' check (char_length(note) <= 80),
  alias_ids uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'declared', 'paid', 'cancelled')),
  payer_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists requests_owner_idx on public.payment_requests (owner_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid references public.profiles (id) on delete set null,
  payer_name text not null,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  recipient_username text not null,
  amount bigint not null check (amount > 0 and amount <= 10000000),
  note text not null default '' check (char_length(note) <= 80),
  request_code text,
  provider_id text,
  status text not null default 'declared' check (status in ('declared', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists payments_payer_idx on public.payments (payer_id, created_at desc);
create index if not exists payments_recipient_idx on public.payments (recipient_id, created_at desc);

-- ---------- Contacts du répertoire (comme WhatsApp) ----------
-- Le téléphone envoie l'empreinte SHA-256 de chaque numéro E.164 ; la base compare avec
-- l'empreinte du numéro de connexion et des alias « téléphone » visibles.
-- Le répertoire lui-même n'est jamais enregistré.
-- (`decode(…, 'escape')` plutôt que `convert_to` : il faut une fonction « immutable » pour une colonne calculée.)

alter table public.profiles add column if not exists findable_by_phone boolean not null default true;
alter table public.profiles add column if not exists phone_hash text
  generated always as (encode(sha256(decode(replace(phone, '\', '\\'), 'escape')), 'hex')) stored;
create index if not exists profiles_phone_hash_idx on public.profiles (phone_hash);

alter table public.aliases add column if not exists value_hash text
  generated always as (
    case when alias_type = 'phone' then encode(sha256(decode(replace(value, '\', '\\'), 'escape')), 'hex') end
  ) stored;
create index if not exists aliases_value_hash_idx on public.aliases (value_hash) where value_hash is not null;

-- Compteur anti-abus : sans lui, on pourrait tester tous les numéros d'un pays.
create table if not exists public.contact_lookups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  lookups int not null check (lookups > 0),
  created_at timestamptz not null default now()
);
create index if not exists contact_lookups_user_idx on public.contact_lookups (user_id, created_at desc);

-- ---------- Règles automatiques ----------

-- Le téléphone du profil vient TOUJOURS du compte vérifié par SMS, jamais du client.
create or replace function public.profiles_set_phone() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text;
begin
  select phone into p from auth.users where id = new.id;
  if p is not null and p <> '' then
    new.phone := case when left(p, 1) = '+' then p else '+' || p end;
  end if;
  new.verified := true;
  return new;
end $$;
drop trigger if exists profiles_set_phone on public.profiles;
create trigger profiles_set_phone before insert or update on public.profiles
  for each row execute function public.profiles_set_phone();

-- Un seul alias principal par personne ; le premier alias l'est d'office.
create or replace function public.aliases_one_primary() returns trigger
language plpgsql as $$
begin
  -- Les mises à jour faites par ce trigger lui-même ne doivent rien relancer.
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.aliases where owner_id = new.owner_id) then
    new.is_primary := true;
  end if;
  if new.is_primary then
    update public.aliases set is_primary = false
      where owner_id = new.owner_id and id <> new.id and is_primary;
  end if;
  return new;
end $$;
drop trigger if exists aliases_one_primary on public.aliases;
create trigger aliases_one_primary before insert or update on public.aliases
  for each row execute function public.aliases_one_primary();

-- Si on supprime l'alias principal, le plus ancien restant le devient.
create or replace function public.aliases_keep_primary() returns trigger
language plpgsql as $$
begin
  if old.is_primary and not exists (select 1 from public.aliases where owner_id = old.owner_id and is_primary) then
    update public.aliases set is_primary = true
      where id = (select id from public.aliases where owner_id = old.owner_id order by created_at limit 1);
  end if;
  return old;
end $$;
drop trigger if exists aliases_keep_primary on public.aliases;
create trigger aliases_keep_primary after delete on public.aliases
  for each row execute function public.aliases_keep_primary();

-- Anti-spam : 50 demandes par jour maximum par personne.
create or replace function public.requests_rate_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.payment_requests
      where owner_id = new.owner_id and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Limite de 50 demandes par jour atteinte.';
  end if;
  return new;
end $$;
drop trigger if exists requests_rate_limit on public.payment_requests;
create trigger requests_rate_limit before insert on public.payment_requests
  for each row execute function public.requests_rate_limit();

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.aliases enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payments enable row level security;
-- Aucune règle : seule la fonction find_contacts écrit et lit ce compteur.
alter table public.contact_lookups enable row level security;

drop policy if exists "profil: moi" on public.profiles;
create policy "profil: moi" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "alias: les miens" on public.aliases;
create policy "alias: les miens" on public.aliases
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "demandes: les miennes" on public.payment_requests;
create policy "demandes: les miennes" on public.payment_requests
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Paiements : lecture par les deux personnes concernées. Écriture uniquement via les fonctions.
drop policy if exists "paiements: lecture" on public.payments;
create policy "paiements: lecture" on public.payments
  for select using (auth.uid() = payer_id or auth.uid() = recipient_id);

-- ---------- Fonctions publiques (exposent le strict nécessaire) ----------

create or replace function public._public_profile(p public.profiles, only_ids uuid[] default '{}')
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'username', p.username,
    'full_name', p.full_name,
    'verified', p.verified,
    'aliases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'provider_id', a.provider_id, 'alias_type', a.alias_type,
        'value', a.value, 'label', a.label, 'is_primary', a.is_primary
      ) order by a.is_primary desc, a.created_at)
      from public.aliases a
      where a.owner_id = p.id and a.visible
        and (cardinality(only_ids) = 0 or a.id = any (only_ids))
    ), '[]'::jsonb)
  );
$$;
revoke all on function public._public_profile(public.profiles, uuid[]) from public, anon, authenticated;

create or replace function public.get_public_profile(p_username text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._public_profile(p) from public.profiles p where p.username = lower(p_username);
$$;

create or replace function public.get_public_request(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', r.code, 'amount', r.amount, 'note', r.note, 'status', r.status, 'expires_at', r.expires_at,
    'profile', public._public_profile(p, r.alias_ids)
  )
  from public.payment_requests r join public.profiles p on p.id = r.owner_id
  where r.code = upper(p_code);
$$;

create or replace function public.search_profiles(p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public._public_profile(p)), '[]'::jsonb)
  from (
    select * from public.profiles p
    where auth.uid() is not null
      and p.discoverable and p.id <> auth.uid()
      and char_length(trim(p_query)) >= 2
      and (p.username like '%' || lower(ltrim(trim(p_query), '@')) || '%'
           or lower(p.full_name) like '%' || lower(trim(p_query)) || '%')
    order by (p.username like lower(ltrim(trim(p_query), '@')) || '%') desc, p.username
    limit 10
  ) p;
$$;

-- Contacts du répertoire → profils trouvables. 500 empreintes par appel, 10 000 par jour et par personne
-- (un répertoire complet revérifié chaque jour ; chaque compte demande un numéro vérifié par SMS).
create or replace function public.find_contacts(p_hashes text[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  n int := coalesce(cardinality(p_hashes), 0);
  used int;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour continuer.'; end if;
  if n = 0 then return '[]'::jsonb; end if;
  if n > 500 then raise exception 'Trop de contacts en une fois (500 maximum).'; end if;

  select coalesce(sum(lookups), 0) into used from public.contact_lookups
    where user_id = auth.uid() and created_at > now() - interval '1 day';
  if used + n > 10000 then
    raise exception 'Limite de recherche de contacts atteinte pour aujourd''hui. Réessaie demain.';
  end if;
  insert into public.contact_lookups (user_id, lookups) values (auth.uid(), n);

  with h as (
    select distinct lower(x) as hash from unnest(p_hashes) as x where x ~* '^[0-9a-f]{64}$'
  ), hits as (
    select h.hash, p.id from h join public.profiles p on p.phone_hash = h.hash
    union
    select h.hash, a.owner_id from h
      join public.aliases a on a.value_hash = h.hash and a.visible and a.alias_type = 'phone'
  ), allowed as (
    select hits.hash, p from hits join public.profiles p on p.id = hits.id
    where p.findable_by_phone and p.id <> auth.uid()
  )
  select coalesce(jsonb_agg(jsonb_build_object('hash', hash, 'profile', public._public_profile(p))), '[]'::jsonb)
    into result from allowed;
  return result;
end $$;

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles where username = lower(p_username) and id is distinct from auth.uid()
  );
$$;

-- Un payeur (avec ou sans compte) déclare avoir payé. L'argent, lui, est passé par son app.
create or replace function public.declare_payment(
  p_recipient_username text, p_amount bigint, p_note text,
  p_request_code text default null, p_provider_id text default null, p_payer_name text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  rec public.profiles;
  me public.profiles;
  pay public.payments;
begin
  select * into rec from public.profiles where username = lower(p_recipient_username);
  if rec.id is null then raise exception 'Destinataire introuvable.'; end if;
  if auth.uid() is not null then select * into me from public.profiles where id = auth.uid(); end if;

  -- Anti-spam simple sur les déclarations anonymes
  if auth.uid() is null and (select count(*) from public.payments
      where recipient_id = rec.id and payer_id is null and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Trop de déclarations, réessaie plus tard.';
  end if;

  insert into public.payments (payer_id, payer_name, recipient_id, recipient_username, amount, note, request_code, provider_id)
  values (
    me.id,
    coalesce('@' || me.username, nullif(left(trim(coalesce(p_payer_name, '')), 40), ''), 'Quelqu''un'),
    rec.id, rec.username, p_amount, left(coalesce(p_note, ''), 80), upper(p_request_code), p_provider_id
  ) returning * into pay;

  if p_request_code is not null then
    update public.payment_requests
      set status = 'declared', payer_name = pay.payer_name
      where code = upper(p_request_code) and owner_id = rec.id and status = 'open';
  end if;
  return pay;
end $$;

-- Le bénéficiaire confirme (ou refuse) après avoir vérifié son Wave / sa banque.
create or replace function public.set_payment_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare pay public.payments;
begin
  if p_status not in ('confirmed', 'rejected') then raise exception 'Statut invalide.'; end if;
  update public.payments set status = p_status
    where id = p_id and recipient_id = auth.uid() returning * into pay;
  if pay.id is not null and pay.request_code is not null then
    update public.payment_requests
      set status = case when p_status = 'confirmed' then 'paid' else 'open' end
      where code = pay.request_code and owner_id = auth.uid();
  end if;
end $$;

grant execute on function public.get_public_profile(text) to anon, authenticated;
grant execute on function public.get_public_request(text) to anon, authenticated;
grant execute on function public.search_profiles(text) to authenticated;
revoke all on function public.find_contacts(text[]) from public, anon;
grant execute on function public.find_contacts(text[]) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.declare_payment(text, bigint, text, text, text, text) to anon, authenticated;
grant execute on function public.set_payment_status(uuid, text) to authenticated;
