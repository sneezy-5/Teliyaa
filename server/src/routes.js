import { logout, requestCode, verifyCode } from './auth.js';
import { pool, tx } from './db.js';
import { HttpError, rateLimiter } from './http.js';
import { aliasInput, normalizeUsername, optionalBool, providerId, requirePhone, usernameError } from './validate.js';

/**
 * Toutes les routes de l'API. Chaque route : (ctx) => données renvoyées en JSON.
 * ctx = { params, query, body, user, ip }
 * `auth: true` = connexion obligatoire.
 */

const PROFILE_COLS = 'id, username, full_name, phone, verified, discoverable, findable_by_phone, favorite_provider';
const ALIAS_COLS = 'id, owner_id, provider_id, alias_type, value, label, is_primary, visible, created_at';
const PUBLIC_ALIAS_COLS = 'id, owner_id, provider_id, alias_type, value, label, is_primary';

const LOOKUP_BATCH = 500;
const LOOKUP_DAILY = 10_000;

const codeByIp = rateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });
const verifyByIp = rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
const publicByIp = rateLimiter({ max: 120, windowMs: 60 * 1000 });
const searchByUser = rateLimiter({ max: 60, windowMs: 60 * 1000 });

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
    async handler({ body, ip }) {
      codeByIp(`code:${ip}`);
      await requestCode(requirePhone(body.phone), ip);
      return { ok: true };
    }
  },
  {
    method: 'POST',
    path: '/api/auth/verify',
    async handler({ body, ip }) {
      verifyByIp(`verify:${ip}`);
      const { token, user } = await verifyCode(requirePhone(body.phone), body.code);
      return { token, user };
    }
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    auth: true,
    async handler({ user }) {
      await logout(user);
      return { ok: true };
    }
  },

  // ---------- Moi ----------
  {
    method: 'GET',
    path: '/api/me',
    auth: true,
    async handler({ user }) {
      return { user: { id: user.id, phone: user.phone }, profile: await myProfile(user.id) };
    }
  },
  {
    method: 'PUT',
    path: '/api/me/profile',
    auth: true,
    async handler({ user, body }) {
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
    async handler({ user, body }) {
      await requireProfile(user.id);
      const a = aliasInput(body);
      try {
        return await tx(async (db) => {
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
      } catch (e) {
        uniqueViolation(e, 'Tu as déjà enregistré cet alias.');
      }
    }
  },
  {
    method: 'PUT',
    path: '/api/me/aliases/:id',
    auth: true,
    async handler({ user, body, params }) {
      const a = aliasInput(body);
      try {
        return await tx(async (db) => {
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
      } catch (e) {
        uniqueViolation(e, 'Tu as déjà enregistré cet alias.');
      }
    }
  },
  {
    method: 'DELETE',
    path: '/api/me/aliases/:id',
    auth: true,
    async handler({ user, params }) {
      await tx(async (db) => {
        const removed = (await db.query(`delete from aliases where id = $1 and owner_id = $2 returning is_primary`, [params.id, user.id])).rows[0];
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
    async handler({ params, ip }) {
      publicByIp(`pub:${ip}`);
      const { rows } = await pool.query(`select id, username, full_name, verified from profiles where username = $1`, [
        normalizeUsername(params.username)
      ]);
      if (!rows[0]) throw new HttpError(404, 'Cette page n’existe pas.');
      return (await publicProfiles(pool, rows))[0];
    }
  },
  {
    method: 'GET',
    path: '/api/search',
    auth: true,
    async handler({ user, query }) {
      searchByUser(`search:${user.id}`);
      const raw = String(query.get('q') ?? '').trim().toLowerCase().slice(0, 40);
      const handle = raw.replace(/^@/, '');
      if (handle.length < 2) return [];
      const esc = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
      const { rows } = await pool.query(
        `select id, username, full_name, verified from profiles
          where discoverable and id <> $1
            and (username like $2 escape '\\' or lower(full_name) like $3 escape '\\')
          order by (username like $4 escape '\\') desc, username
          limit 10`,
        [user.id, `%${esc(handle)}%`, `%${esc(raw)}%`, `${esc(handle)}%`]
      );
      return publicProfiles(pool, rows);
    }
  },
  {
    method: 'POST',
    path: '/api/contacts/match',
    auth: true,
    async handler({ user, body }) {
      const hashes = Array.isArray(body.hashes) ? body.hashes : null;
      if (!hashes) throw new HttpError(400, 'Liste de contacts invalide.');
      if (hashes.length === 0) return [];
      if (hashes.length > LOOKUP_BATCH) throw new HttpError(400, `Trop de contacts en une fois (${LOOKUP_BATCH} maximum).`);
      const clean = [...new Set(hashes.filter((h) => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h)).map((h) => h.toLowerCase()))];

      return tx(async (db) => {
        // Anti-abus : sans limite, on pourrait tester tous les numéros d'un pays.
        await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [user.id]);
        const used = (
          await db.query(
            `select coalesce(sum(lookups), 0)::int as n from contact_lookups where user_id = $1 and created_at > now() - interval '1 day'`,
            [user.id]
          )
        ).rows[0].n;
        if (used + hashes.length > LOOKUP_DAILY) throw new HttpError(429, 'Limite de recherche de contacts atteinte pour aujourd’hui. Réessaie demain.');
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
            where p.findable_by_phone and p.id <> $1`,
          [user.id, clean]
        );
        // Une personne peut correspondre à plusieurs empreintes : on charge chaque profil une seule fois.
        const people = [...new Map(rows.map((r) => [r.id, r])).values()];
        const profiles = await publicProfiles(db, people);
        const profileById = new Map(people.map((p, i) => [p.id, profiles[i]]));
        return rows.map((r) => ({ hash: r.hash, profile: profileById.get(r.id) }));
      });
    }
  }
];
