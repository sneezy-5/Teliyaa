import { RULE_LABELS, track } from './audit.js';
import { pool, tx } from './db.js';
import { HttpError } from './http.js';

/**
 * Back-office (réservé aux numéros de ADMIN_PHONES, voir app.js) : chiffres d'usage, utilisateurs,
 * comportements suspects, journal, blocage d'un compte.
 * `admin: true` → 404 pour tout autre compte ; `auth: true` → PIN obligatoire comme le reste.
 */

const int = (v, def, max) => Math.min(Math.max(Number.parseInt(v ?? '', 10) || def, 1), max);
const UUID = /^[0-9a-f-]{36}$/i;

export const adminRoutes = [
  {
    method: 'GET',
    path: '/api/admin/overview',
    auth: true,
    admin: true,
    async handler() {
      const one = async (sql) => (await pool.query(sql)).rows[0];
      const all = async (sql) => (await pool.query(sql)).rows;

      const users = await one(`
        select count(*)::int as total,
               count(*) filter (where created_at >= current_date)::int as new_today,
               count(*) filter (where created_at > now() - interval '7 days')::int as new_7d,
               count(*) filter (where last_seen_at > now() - interval '24 hours')::int as active_24h,
               count(*) filter (where last_seen_at > now() - interval '7 days')::int as active_7d,
               count(*) filter (where last_seen_at > now() - interval '30 days')::int as active_30d,
               count(*) filter (where blocked_at is not null)::int as blocked,
               count(*) filter (where pin_hash is null)::int as without_pin
          from users`);
      const content = await one(`
        select (select count(*) from profiles)::int as profiles,
               (select count(*) from aliases)::int as aliases,
               (select count(*) from suspects where status = 'open')::int as open_suspects`);
      const providers = await all(`select provider_id as key, count(*)::int as n from aliases group by 1 order by 2 desc`);
      // Appareil de la dernière session active de chaque personne (30 jours)
      const devices = await all(`
        select coalesce(device, 'Inconnu') as key, count(*)::int as n from (
          select distinct on (user_id) user_id, device from sessions
           where last_seen_at > now() - interval '30 days' order by user_id, last_seen_at desc) s
         group by 1 order by 2 desc`);
      const events24h = await all(`
        select type as key, count(*)::int as n from events
         where created_at > now() - interval '24 hours' group by 1 order by 2 desc`);
      // 14 derniers jours : inscriptions, personnes actives, visites de la vitrine
      const days = await all(`
        select d::date as day,
               (select count(*) from users where created_at::date = d::date)::int as signups,
               (select count(distinct user_id) from events where user_id is not null and created_at::date = d::date)::int as active,
               (select count(*) from events where type = 'site_visit' and created_at::date = d::date)::int as visits
          from generate_series(current_date - 13, current_date, interval '1 day') d
         order by d`);
      // Vitrine teliyaa.com (visiteurs uniques ≈ adresses IP différentes)
      const site = await one(`
        select count(*) filter (where type = 'site_visit' and created_at >= current_date)::int as visits_today,
               count(*) filter (where type = 'site_visit')::int as visits_7d,
               count(distinct ip) filter (where type = 'site_visit')::int as visitors_7d,
               count(*) filter (where type = 'site_cta')::int as cta_7d
          from events where type in ('site_visit', 'site_cta') and created_at > now() - interval '7 days'`);
      const sources = await all(`
        select coalesce(target, 'direct') as key, count(*)::int as n from events
         where type = 'site_visit' and created_at > now() - interval '7 days'
         group by 1 order by 2 desc limit 10`);
      return { users, content, providers, devices, events24h, days, site, sources };
    }
  },

  {
    method: 'GET',
    path: '/api/admin/users',
    auth: true,
    admin: true,
    async handler({ query }) {
      const q = String(query.get('q') ?? '').trim().toLowerCase().replace(/^@/, '').slice(0, 40);
      const esc = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
      const like = `%${esc(q)}%`;
      const { rows } = await pool.query(
        `select u.id, u.phone, u.created_at, u.last_seen_at, u.blocked_at, u.pin_hash is not null as has_pin,
                p.username, p.full_name,
                (select count(*) from aliases a where a.owner_id = u.id)::int as aliases,
                s.device, s.last_ip,
                (select count(*) from events e where e.user_id = u.id and e.created_at > now() - interval '24 hours')::int as events_24h,
                (select count(*) from suspects x where x.user_id = u.id and x.status = 'open')::int as open_suspects
           from users u
           left join profiles p on p.id = u.id
           left join lateral (
             select device, last_ip from sessions where user_id = u.id order by last_seen_at desc nulls last limit 1
           ) s on true
          where $1 = '' or u.phone like $2 escape '\\' or p.username like $2 escape '\\' or lower(p.full_name) like $2 escape '\\'
          order by u.last_seen_at desc nulls last, u.created_at desc
          limit 100`,
        [q, like]
      );
      return rows;
    }
  },

  {
    method: 'GET',
    path: '/api/admin/users/:id',
    auth: true,
    admin: true,
    async handler({ params }) {
      if (!UUID.test(params.id)) throw new HttpError(404, 'Introuvable.');
      const user = (
        await pool.query(
          `select u.id, u.phone, u.created_at, u.last_seen_at, u.blocked_at, u.blocked_reason, u.pin_hash is not null as has_pin,
                  u.pin_failures, p.username, p.full_name, p.discoverable, p.findable_by_phone, p.favorite_provider
             from users u left join profiles p on p.id = u.id where u.id = $1`,
          [params.id]
        )
      ).rows[0];
      if (!user) throw new HttpError(404, 'Utilisateur introuvable.');
      const [aliases, sessions, events, suspects] = await Promise.all([
        pool.query(`select provider_id, alias_type, value, label, name, account_phone, account_phone_visible, is_primary, visible, created_at from aliases where owner_id = $1 order by created_at`, [params.id]),
        pool.query(
          `select created_at, last_seen_at, last_ip, device, pin_ok, expires_at from sessions where user_id = $1 order by last_seen_at desc nulls last`,
          [params.id]
        ),
        pool.query(`select id, type, target, ip, device, meta, created_at from events where user_id = $1 order by created_at desc limit 200`, [params.id]),
        pool.query(`select id, rule, detail, hits, day, status, updated_at from suspects where user_id = $1 order by updated_at desc limit 50`, [params.id])
      ]);
      return {
        user,
        aliases: aliases.rows,
        sessions: sessions.rows,
        events: events.rows,
        suspects: suspects.rows.map((s) => ({ ...s, label: RULE_LABELS[s.rule] ?? s.rule }))
      };
    }
  },

  {
    method: 'GET',
    path: '/api/admin/suspects',
    auth: true,
    admin: true,
    async handler({ query }) {
      const status = ['open', 'cleared', 'blocked'].includes(query.get('status')) ? query.get('status') : 'open';
      const { rows } = await pool.query(
        `select x.id, x.rule, x.subject, x.user_id, x.ip, x.detail, x.hits, x.day, x.status, x.created_at, x.updated_at,
                p.username, p.full_name, u.phone, u.blocked_at
           from suspects x
           left join users u on u.id = x.user_id
           left join profiles p on p.id = x.user_id
          where x.status = $1
          order by x.updated_at desc
          limit 200`,
        [status]
      );
      return rows.map((s) => ({ ...s, label: RULE_LABELS[s.rule] ?? s.rule }));
    }
  },

  {
    // Classer un suspect : « rien à signaler » (cleared) ou rouvrir (open)
    method: 'POST',
    path: '/api/admin/suspects/:id',
    auth: true,
    admin: true,
    async handler({ params, body }) {
      const status = body.status === 'open' ? 'open' : 'cleared';
      const { rowCount } = await pool.query(`update suspects set status = $2, updated_at = now() where id = $1`, [
        int(params.id, 0, Number.MAX_SAFE_INTEGER),
        status
      ]);
      if (!rowCount) throw new HttpError(404, 'Introuvable.');
      return { ok: true };
    }
  },

  {
    // Bloquer : déconnecté partout, ne peut plus se reconnecter, profil invisible
    method: 'POST',
    path: '/api/admin/users/:id/block',
    auth: true,
    admin: true,
    async handler(ctx) {
      const { params, body, user: admin } = ctx;
      if (!UUID.test(params.id)) throw new HttpError(404, 'Introuvable.');
      if (params.id === admin.id) throw new HttpError(400, 'Tu ne peux pas bloquer ton propre compte.');
      const reason = String(body.reason ?? '').trim().slice(0, 200) || 'Comportement suspect';
      await tx(async (db) => {
        const { rowCount } = await db.query(`update users set blocked_at = now(), blocked_reason = $2 where id = $1`, [params.id, reason]);
        if (!rowCount) throw new HttpError(404, 'Utilisateur introuvable.');
        await db.query(`delete from sessions where user_id = $1`, [params.id]);
        await db.query(`update suspects set status = 'blocked', updated_at = now() where user_id = $1 and status = 'open'`, [params.id]);
      });
      await track(ctx, 'admin_block', { target: params.id, meta: { reason } });
      return { ok: true };
    }
  },

  {
    method: 'POST',
    path: '/api/admin/users/:id/unblock',
    auth: true,
    admin: true,
    async handler(ctx) {
      const { params } = ctx;
      if (!UUID.test(params.id)) throw new HttpError(404, 'Introuvable.');
      const { rowCount } = await pool.query(`update users set blocked_at = null, blocked_reason = null where id = $1`, [params.id]);
      if (!rowCount) throw new HttpError(404, 'Utilisateur introuvable.');
      await track(ctx, 'admin_unblock', { target: params.id });
      return { ok: true };
    }
  },

  {
    // Journal en direct (filtrable par type ou par adresse IP)
    method: 'GET',
    path: '/api/admin/events',
    auth: true,
    admin: true,
    async handler({ query }) {
      const type = String(query.get('type') ?? '').slice(0, 40);
      const ip = String(query.get('ip') ?? '').slice(0, 60);
      const limit = int(query.get('limit'), 200, 500);
      const { rows } = await pool.query(
        `select e.id, e.type, e.target, e.ip, e.device, e.meta, e.created_at, e.user_id, p.username, u.phone
           from events e
           left join users u on u.id = e.user_id
           left join profiles p on p.id = e.user_id
          where ($1 = '' or e.type = $1) and ($2 = '' or e.ip = $2)
          order by e.created_at desc
          limit $3`,
        [type, ip, limit]
      );
      return rows;
    }
  }
];
