import { adminRoutes } from './admin.js';
import { track } from './audit.js';
import { logout, requestCode, verifyCode } from './auth.js';
import { pool, tx } from './db.js';
import { HttpError, rateLimiter } from './http.js';
import { resetPin, setPin, verifyPin } from './pin.js';
import { sharingRoutes, viewerId, visibleTo } from './sharing.js';
import { aliasInput, normalizeUsername, optionalBool, providerId, requirePhone, usernameError } from './validate.js';

/**
 * Toutes les routes de l'API. Chaque route : (ctx) => données renvoyées en JSON.
 * ctx = { params, query, body, user, ip }
 * `auth: true` = connexion obligatoire, ET code PIN déjà tapé sur cette session,
 * sauf `pin: false` (routes du PIN lui-même, /api/me, déconnexion).
 */

const PROFILE_COLS = 'id, username, full_name, phone, verified, discoverable, findable_by_phone, favorite_provider, visibility';
const ALIAS_COLS = 'id, owner_id, provider_id, alias_type, value, label, is_primary, visible, created_at';
const PUBLIC_ALIAS_COLS = 'id, owner_id, provider_id, alias_type, value, label, is_primary';

const LOOKUP_BATCH = 500;
const LOOKUP_DAILY = 10_000;

const codeByIp = rateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });
const verifyByIp = rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
const publicByIp = rateLimiter({ max: 120, windowMs: 60 * 1000 });
const searchByUser = rateLimiter({ max: 60, windowMs: 60 * 1000 });
const pinByUser = rateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });

function uniqueViolation(e, message) {
  if (e?.code === '23505') throw new HttpError(409, message);
  throw e;
}

/** Profils publics (pseudo, nom, alias visibles) — jamais le numéro de connexion. */
async function publicProfiles(db, rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const aliases = (
    await db.query(
      `select ${PUBLIC_ALIAS_COLS} from aliases where owner_id = any($1) and visible order by is_primary desc, created_at`,
      [ids]
    )
  ).rows;
  return rows.map((p) => ({
    username: p.username,
    full_name: p.full_name,
    verified: p.verified,
    aliases: aliases.filter((a) => a.owner_id === p.id).map(({ owner_id, ...a }) => a)
  }));
}

async function myProfile(userId) {
  return (await pool.query(`select ${PROFILE_COLS} from profiles where id = $1`, [userId])).rows[0] ?? null;
}

async function requireProfile(userId) {
  const p = await myProfile(userId);
  if (!p) throw new HttpError(403, 'Crée ton profil pour continuer.');
  return p;
}

export const routes = [
  // ---------- Connexion ----------
  {
    method: 'POST',
    path: '/api/auth/code',
    async handler(ctx) {
      const { body, ip } = ctx;
      codeByIp(`code:${ip}`);
      const phone = requirePhone(body.phone);
      await track(ctx, 'otp_request', { target: phone });
      await requestCode(phone, ip);
      return { ok: true };
    }
  },
  {
    method: 'POST',
    path: '/api/auth/verify',
    async handler(ctx) {
      const { body, ip } = ctx;
      verifyByIp(`verify:${ip}`);
      const phone = requirePhone(body.phone);
      try {
        const { token, user } = await verifyCode(phone, body.code);
        if (user.is_new) await track(ctx, 'signup', { userId: user.id, target: phone });
        await track(ctx, 'login', { userId: user.id });
        return { token, user };
      } catch (e) {
        if (e instanceof HttpError && e.status === 400) await track(ctx, 'otp_fail', { target: phone });
        throw e;
      }
    }
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    auth: true,
    pin: false,
    async handler({ user }) {
      await logout(user);
      return { ok: true };
    }
  },

  // ---------- Code PIN (accessibles avant d'avoir tapé le PIN) ----------
  {
    method: 'POST',
    path: '/api/me/pin/verify',
    auth: true,
    pin: false,
    async handler(ctx) {
      const { user, body } = ctx;
      pinByUser(`pin:${user.id}`);
      try {
        await verifyPin(user, body.pin);
      } catch (e) {
        // 401 = 5e erreur : toutes les sessions viennent d'être fermées
        if (e instanceof HttpError) await track(ctx, e.status === 401 ? 'pin_lockout' : 'pin_fail');
        throw e;
      }
      return { ok: true };
    }
  },
  {
    // Premier code (comptes existants compris) ou changement : l'ancien code est alors exigé
    method: 'PUT',
    path: '/api/me/pin',
    auth: true,
    pin: false,
    async handler({ user, body }) {
      pinByUser(`pin:${user.id}`);
      // Changer un code existant demande une session déjà déverrouillée
      if (user.has_pin && !user.pin_ok) throw new HttpError(403, 'Entre ton code pour continuer.');
      await setPin(user, body.pin, body.current);
      return { ok: true };
    }
  },
  {
    method: 'POST',
    path: '/api/me/pin/reset',
    auth: true,
    pin: false,
    async handler(ctx) {
      const { user, body } = ctx;
      pinByUser(`pin:${user.id}`);
      await resetPin(user, body.pin);
      await track(ctx, 'pin_reset');
      return { ok: true };
    }
  },

  // ---------- Moi ----------
  {
    method: 'GET',
    path: '/api/me',
    auth: true,
    pin: false,
    async handler({ user }) {
      return {
        user: { id: user.id, phone: user.phone, has_pin: user.has_pin, pin_ok: user.pin_ok, is_admin: user.is_admin },
        profile: await myProfile(user.id)
      };
    }
  },
  {
    // Suppression du compte (exigée par le Play Store) : profil, alias, sessions, historique de recherche.
    method: 'DELETE',
    path: '/api/me',
    auth: true,
    async handler(ctx) {
      const { user } = ctx;
      await track(ctx, 'account_delete');
      await tx(async (db) => {
        await db.query(`delete from otp_codes where phone = $1`, [user.phone]);
        await db.query(`delete from otp_sends where phone = $1`, [user.phone]);
        // Supprime aussi, en cascade : profil, alias, sessions, compteurs de recherche de contacts
        await db.query(`delete from users where id = $1`, [user.id]);
      });
      return { ok: true };
    }
  },
  {
    method: 'PUT',
    path: '/api/me/profile',
    auth: true,
    async handler(ctx) {
      const { user, body } = ctx;
      const username = normalizeUsername(body.username);
      const err = usernameError(username);
      if (err) throw new HttpError(400, err);
      const fullName = String(body.full_name ?? '').trim();
      if (fullName.length < 2 || fullName.length > 60) throw new HttpError(400, 'Indique ton nom (2 à 60 caractères).');
      const discoverable = optionalBool(body.discoverable, 'discoverable');
      const findable = optionalBool(body.findable_by_phone, 'findable_by_phone');
      const setFavorite = 'favorite_provider' in body;
      const favorite = body.favorite_provider == null ? null : providerId(body.favorite_provider);

      try {
        // Le numéro du profil vient TOUJOURS du compte vérifié, jamais du client.
        const { rows } = await pool.query(
          `insert into profiles (id, username, full_name, phone, discoverable, findable_by_phone, favorite_provider)
           values ($1, $2, $3, $4, coalesce($5, true), coalesce($6, true), $7)
           on conflict (id) do update set
             username = excluded.username,
             full_name = excluded.full_name,
             discoverable = coalesce($5, profiles.discoverable),
             findable_by_phone = coalesce($6, profiles.findable_by_phone),
             favorite_provider = case when $8 then $7 else profiles.favorite_provider end
           returning ${PROFILE_COLS}`,
          [user.id, username, fullName, user.phone, discoverable ?? null, findable ?? null, favorite, setFavorite]
        );
        await track(ctx, 'profile_update', { target: username, meta: { full_name: fullName } });
        return rows[0];
      } catch (e) {
        uniqueViolation(e, 'Ce pseudo est déjà pris.');
      }
    }
  },
  {
    method: 'GET',
    path: '/api/usernames/:username',
    async handler({ params, user, ip }) {
      publicByIp(`pub:${ip}`);
      const u = normalizeUsername(params.username);
      const { rows } = await pool.query(`select id from profiles where username = $1`, [u]);
      return { available: rows.length === 0 || rows[0].id === user?.id };
    }
  },

  // ---------- Mes comptes (alias) ----------
  {
    method: 'GET',
    path: '/api/me/aliases',
    auth: true,
    async handler({ user }) {
      return (await pool.query(`select ${ALIAS_COLS} from aliases where owner_id = $1 order by is_primary desc, created_at`, [user.id])).rows;
    }
  },
  {
    method: 'POST',
    path: '/api/me/aliases',
    auth: true,
    async handler(ctx) {
      const { user, body } = ctx;
      await requireProfile(user.id);
      const a = aliasInput(body);
      try {
        const row = await tx(async (db) => {
          const count = (await db.query(`select count(*)::int as n from aliases where owner_id = $1`, [user.id])).rows[0].n;
          if (count >= 30) throw new HttpError(400, '30 comptes maximum.');
          const primary = a.is_primary || count === 0; // le premier compte est le principal
          if (primary) await db.query(`update aliases set is_primary = false where owner_id = $1`, [user.id]);
          const { rows } = await db.query(
            `insert into aliases (owner_id, provider_id, alias_type, value, label, is_primary, visible)
             values ($1, $2, $3, $4, $5, $6, $7) returning ${ALIAS_COLS}`,
            [user.id, a.provider_id, a.alias_type, a.value, a.label, primary, a.visible]
          );
          return rows[0];
        });
        await track(ctx, 'alias_add', { target: a.provider_id, meta: { value: a.value, label: a.label } });
        return row;
      } catch (e) {
        uniqueViolation(e, 'Tu as déjà enregistré cet alias.');
      }
    }
  },
  {
    method: 'PUT',
    path: '/api/me/aliases/:id',
    auth: true,
    async handler(ctx) {
      const { user, body, params } = ctx;
      const a = aliasInput(body);
      try {
        const row = await tx(async (db) => {
          const existing = (await db.query(`select is_primary from aliases where id = $1 and owner_id = $2`, [params.id, user.id])).rows[0];
          if (!existing) throw new HttpError(404, 'Compte introuvable.');
          // On ne peut pas « retirer » le principal sans en choisir un autre : il le reste.
          const primary = a.is_primary || existing.is_primary;
          if (a.is_primary) await db.query(`update aliases set is_primary = false where owner_id = $1 and id <> $2`, [user.id, params.id]);
          const { rows } = await db.query(
            `update aliases set provider_id = $3, alias_type = $4, value = $5, label = $6, is_primary = $7, visible = $8
              where id = $1 and owner_id = $2 returning ${ALIAS_COLS}`,
            [params.id, user.id, a.provider_id, a.alias_type, a.value, a.label, primary, a.visible]
          );
          return rows[0];
        });
        await track(ctx, 'alias_update', { target: a.provider_id, meta: { value: a.value, label: a.label } });
        return row;
      } catch (e) {
        uniqueViolation(e, 'Tu as déjà enregistré cet alias.');
      }
    }
  },
  {
    method: 'DELETE',
    path: '/api/me/aliases/:id',
    auth: true,
    async handler(ctx) {
      const { user, params } = ctx;
      await tx(async (db) => {
        const removed = (
          await db.query(`delete from aliases where id = $1 and owner_id = $2 returning is_primary, provider_id, value`, [params.id, user.id])
        ).rows[0];
        if (removed) await track(ctx, 'alias_delete', { target: removed.provider_id, meta: { value: removed.value } });
        // Si on supprime le principal, le plus ancien restant le devient.
        if (removed?.is_primary) {
          await db.query(
            `update aliases set is_primary = true
              where id = (select id from aliases where owner_id = $1 order by created_at limit 1)`,
            [user.id]
          );
        }
      });
      return { ok: true };
    }
  },

  // ---------- Profils publics, recherche, contacts ----------
  {
    method: 'GET',
    path: '/api/profiles/:username',
    async handler(ctx) {
      const { params, ip, user } = ctx;
      publicByIp(`pub:${ip}`);
      const username = normalizeUsername(params.username);
      const { rows } = await pool.query(
        `select p.id, p.username, p.full_name, p.verified, coalesce(${visibleTo('$2')}, false) as allowed
           from profiles p join users u on u.id = p.id
          where p.username = $1 and u.blocked_at is null`,
        [username, viewerId(user)]
      );
      if (!rows[0]) throw new HttpError(404, 'Cette page n’existe pas.');
      // Profil privé : seulement son propriétaire et les personnes qu'il a choisies (ou via un lien secret)
      if (!rows[0].allowed) throw new HttpError(403, 'Ce profil est privé.');
      // Consultation notée (sauf sa propre page) : sert à repérer qui regarde quelqu'un en boucle
      if (rows[0].id !== user?.id) await track(ctx, 'profile_view', { target: username });
      return (await publicProfiles(pool, rows))[0];
    }
  },
  {
    method: 'GET',
    path: '/api/search',
    auth: true,
    async handler(ctx) {
      const { user, query } = ctx;
      searchByUser(`search:${user.id}`);
      const raw = String(query.get('q') ?? '').trim().toLowerCase().slice(0, 40);
      const handle = raw.replace(/^@/, '');
      if (handle.length < 2) return [];
      const esc = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
      const { rows } = await pool.query(
        `select p.id, p.username, p.full_name, p.verified from profiles p join users u on u.id = p.id
          where p.discoverable and p.id <> $1 and u.blocked_at is null and ${visibleTo('$1')}
            and (p.username like $2 escape '\\' or lower(p.full_name) like $3 escape '\\')
          order by (p.username like $4 escape '\\') desc, p.username
          limit 10`,
        [user.id, `%${esc(handle)}%`, `%${esc(raw)}%`, `${esc(handle)}%`]
      );
      // La recherche se fait pendant la frappe : on ne note que les recherches d'au moins 3 caractères
      if (handle.length >= 3) await track(ctx, 'search', { target: handle, meta: { results: rows.length } });
      return publicProfiles(pool, rows);
    }
  },
  {
    method: 'POST',
    path: '/api/contacts/match',
    auth: true,
    async handler(ctx) {
      const { user, body } = ctx;
      const hashes = Array.isArray(body.hashes) ? body.hashes : null;
      if (!hashes) throw new HttpError(400, 'Liste de contacts invalide.');
      if (hashes.length === 0) return [];
      if (hashes.length > LOOKUP_BATCH) throw new HttpError(400, `Trop de contacts en une fois (${LOOKUP_BATCH} maximum).`);
      const clean = [...new Set(hashes.filter((h) => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h)).map((h) => h.toLowerCase()))];

      const result = await tx(async (db) => {
        // Anti-abus : sans limite, on pourrait tester tous les numéros d'un pays.
        await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [user.id]);
        const used = (
          await db.query(
            `select coalesce(sum(lookups), 0)::int as n from contact_lookups where user_id = $1 and created_at > now() - interval '1 day'`,
            [user.id]
          )
        ).rows[0].n;
        if (used + hashes.length > LOOKUP_DAILY) {
          await track(ctx, 'contacts_limit', { meta: { count: hashes.length, used } });
          throw new HttpError(429, 'Limite de recherche de contacts atteinte pour aujourd’hui. Réessaie demain.');
        }
        await db.query(`insert into contact_lookups (user_id, lookups) values ($1, $2)`, [user.id, hashes.length]);
        if (clean.length === 0) return [];

        const { rows } = await db.query(
          `with h as (select unnest($2::text[]) as hash),
           hits as (
             select h.hash, p.id from h join profiles p on p.phone_hash = h.hash
             union
             select h.hash, a.owner_id from h join aliases a on a.value_hash = h.hash and a.visible and a.alias_type = 'phone'
           )
           select hits.hash, p.id, p.username, p.full_name, p.verified
             from hits join profiles p on p.id = hits.id
             join users u on u.id = p.id
            where p.findable_by_phone and p.id <> $1 and u.blocked_at is null and ${visibleTo('$1')}`,
          [user.id, clean]
        );
        // Une personne peut correspondre à plusieurs empreintes : on charge chaque profil une seule fois.
        const people = [...new Map(rows.map((r) => [r.id, r])).values()];
        const profiles = await publicProfiles(db, people);
        const profileById = new Map(people.map((p, i) => [p.id, profiles[i]]));
        return rows.map((r) => ({ hash: r.hash, profile: profileById.get(r.id) }));
      });
      // Seulement le nombre de numéros comparés et trouvés : jamais les empreintes
      await track(ctx, 'contacts_match', { meta: { count: hashes.length, hits: result.length } });
      return result;
    }
  },

  ...sharingRoutes(publicProfiles),
  ...adminRoutes
];
