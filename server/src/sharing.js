import { randomBytes } from 'node:crypto';
import { track } from './audit.js';
import { pool, tx } from './db.js';
import { HttpError, rateLimiter } from './http.js';
import { normalizeUsername } from './validate.js';

/**
 * Qui peut voir mon profil :
 * - public  : tout le monde avec le lien teliyaa.com/u/pseudo (par défaut)
 * - private : seulement moi, les personnes que j'ai ajoutées (comptes Teliyaa) et les liens secrets
 * Personnes et liens peuvent avoir une date de fin (1 h, 24 h, 7 j, 30 j) ou durer toujours.
 */

export const DURATIONS = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days', forever: null };
const MAX_GRANTS = 200;
const MAX_LINKS = 20;

const sharedByIp = rateLimiter({ max: 120, windowMs: 60 * 1000 });

function duration(value) {
  const key = value == null ? 'forever' : String(value);
  if (!(key in DURATIONS)) throw new HttpError(400, 'Durée invalide.');
  return DURATIONS[key];
}

/**
 * Condition SQL « ce profil `p` est visible par la personne `viewerParam` » (paramètre uuid, ou null).
 * À utiliser partout où un profil est montré : page /u/, recherche, contacts.
 */
export function visibleTo(viewerParam) {
  return `(p.visibility = 'public' or p.id = ${viewerParam}::uuid or exists (
    select 1 from profile_grants g
     where g.owner_id = p.id and g.viewer_id = ${viewerParam}::uuid and (g.expires_at is null or g.expires_at > now())
  ))`;
}

/** Une autorisation ne compte que pour une session déverrouillée (PIN tapé) */
export const viewerId = (user) => (user?.pin_ok ? user.id : null);

async function ownProfileId(userId) {
  const row = (await pool.query(`select id from profiles where id = $1`, [userId])).rows[0];
  if (!row) throw new HttpError(403, 'Crée ton profil pour continuer.');
  return row.id;
}

async function sharing(userId) {
  const visibility = (await pool.query(`select visibility from profiles where id = $1`, [userId])).rows[0]?.visibility ?? 'public';
  const grants = (
    await pool.query(
      `select p.username, p.full_name, g.expires_at, g.created_at
         from profile_grants g join profiles p on p.id = g.viewer_id
        where g.owner_id = $1 and (g.expires_at is null or g.expires_at > now())
        order by g.created_at desc`,
      [userId]
    )
  ).rows;
  const links = (
    await pool.query(
      `select id, token, expires_at, created_at from profile_links
        where owner_id = $1 and (expires_at is null or expires_at > now())
        order by created_at desc`,
      [userId]
    )
  ).rows;
  return { visibility, grants, links };
}

export function sharingRoutes(publicProfiles) {
  return [
    {
      method: 'GET',
      path: '/api/me/sharing',
      auth: true,
      async handler({ user }) {
        await ownProfileId(user.id);
        return sharing(user.id);
      }
    },
    {
      method: 'PUT',
      path: '/api/me/visibility',
      auth: true,
      async handler(ctx) {
        const { user, body } = ctx;
        const visibility = body.visibility;
        if (visibility !== 'public' && visibility !== 'private') throw new HttpError(400, 'Choix invalide.');
        await ownProfileId(user.id);
        await pool.query(`update profiles set visibility = $2 where id = $1`, [user.id, visibility]);
        await track(ctx, 'visibility_change', { target: visibility });
        return sharing(user.id);
      }
    },
    {
      method: 'POST',
      path: '/api/me/grants',
      auth: true,
      async handler(ctx) {
        const { user, body } = ctx;
        await ownProfileId(user.id);
        const interval = duration(body.duration);
        const username = normalizeUsername(body.username);
        const viewer = (
          await pool.query(
            `select p.id from profiles p join users u on u.id = p.id where p.username = $1 and u.blocked_at is null`,
            [username]
          )
        ).rows[0];
        if (!viewer) throw new HttpError(404, `Personne ne s'appelle @${username || '…'} sur Teliyaa.`);
        if (viewer.id === user.id) throw new HttpError(400, 'Tu vois déjà ton propre profil.');
        await tx(async (db) => {
          const n = (await db.query(`select count(*)::int as n from profile_grants where owner_id = $1`, [user.id])).rows[0].n;
          if (n >= MAX_GRANTS) throw new HttpError(400, `${MAX_GRANTS} personnes maximum.`);
          await db.query(
            `insert into profile_grants (owner_id, viewer_id, expires_at) values ($1, $2, now() + $3::interval)
             on conflict (owner_id, viewer_id) do update set expires_at = excluded.expires_at, created_at = now()`,
            [user.id, viewer.id, interval]
          );
        });
        await track(ctx, 'grant_add', { target: username, meta: { duration: body.duration ?? 'forever' } });
        return sharing(user.id);
      }
    },
    {
      method: 'DELETE',
      path: '/api/me/grants/:username',
      auth: true,
      async handler(ctx) {
        const { user, params } = ctx;
        const username = normalizeUsername(params.username);
        await pool.query(
          `delete from profile_grants where owner_id = $1 and viewer_id = (select id from profiles where username = $2)`,
          [user.id, username]
        );
        await track(ctx, 'grant_remove', { target: username });
        return sharing(user.id);
      }
    },
    {
      method: 'POST',
      path: '/api/me/links',
      auth: true,
      async handler(ctx) {
        const { user, body } = ctx;
        await ownProfileId(user.id);
        const interval = duration(body.duration);
        const token = randomBytes(12).toString('base64url'); // 16 caractères, impossible à deviner
        const link = await tx(async (db) => {
          const n = (
            await db.query(
              `select count(*)::int as n from profile_links where owner_id = $1 and (expires_at is null or expires_at > now())`,
              [user.id]
            )
          ).rows[0].n;
          if (n >= MAX_LINKS) throw new HttpError(400, `${MAX_LINKS} liens actifs maximum. Supprimes-en un.`);
          return (
            await db.query(
              `insert into profile_links (owner_id, token, expires_at) values ($1, $2, now() + $3::interval)
               returning id, token, expires_at, created_at`,
              [user.id, token, interval]
            )
          ).rows[0];
        });
        await track(ctx, 'link_create', { meta: { duration: body.duration ?? 'forever' } });
        return { link, sharing: await sharing(user.id) };
      }
    },
    {
      method: 'DELETE',
      path: '/api/me/links/:id',
      auth: true,
      async handler(ctx) {
        const { user, params } = ctx;
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new HttpError(404, 'Lien introuvable.');
        await pool.query(`delete from profile_links where id = $1 and owner_id = $2`, [params.id, user.id]);
        await track(ctx, 'link_delete');
        return sharing(user.id);
      }
    },
    {
      // Page ouverte avec un lien secret : pas besoin de compte
      method: 'GET',
      path: '/api/shared/:token',
      async handler(ctx) {
        const { params, ip, user } = ctx;
        sharedByIp(`shared:${ip}`);
        const token = String(params.token);
        if (!/^[A-Za-z0-9_-]{16,32}$/.test(token)) throw new HttpError(404, 'Ce lien a expiré ou a été supprimé.');
        const { rows } = await pool.query(
          `select p.id, p.username, p.full_name, p.verified, l.expires_at
             from profile_links l
             join profiles p on p.id = l.owner_id
             join users u on u.id = p.id
            where l.token = $1 and (l.expires_at is null or l.expires_at > now()) and u.blocked_at is null`,
          [token]
        );
        if (!rows[0]) throw new HttpError(404, 'Ce lien a expiré ou a été supprimé.');
        if (rows[0].id !== user?.id) await track(ctx, 'profile_view', { target: rows[0].username, meta: { via: 'link' } });
        const [profile] = await publicProfiles(pool, rows);
        return { ...profile, shared_until: rows[0].expires_at };
      }
    }
  ];
}
