import { pool } from './db.js';

/**
 * Journal d'activité et détection des comportements suspects.
 * Tout est conservé 30 jours (voir cleanup dans db.js) et n'est visible que des administrateurs.
 * Les empreintes de contacts ne sont JAMAIS enregistrées : seulement leur nombre.
 */

/** « Android · Chrome », « iPhone · Safari », « App Android »… à partir du User-Agent */
export function deviceOf(ua) {
  const s = String(ua ?? '');
  if (!s) return 'Inconnu';
  const os = /iPhone|iPad|iPod/i.test(s)
    ? 'iPhone'
    : /Android/i.test(s)
      ? 'Android'
      : /Windows/i.test(s)
        ? 'Windows'
        : /Macintosh|Mac OS X/i.test(s)
          ? 'Mac'
          : /Linux/i.test(s)
            ? 'Linux'
            : 'Autre';
  // WebView de l'app Capacitor : pas de nom de navigateur habituel
  if (/; wv\)/.test(s) || /Capacitor/i.test(s)) return `App ${os}`;
  const browser = /SamsungBrowser/i.test(s)
    ? 'Samsung'
    : /OPR\/|Opera/i.test(s)
      ? 'Opera'
      : /Edg\//i.test(s)
        ? 'Edge'
        : /Firefox|FxiOS/i.test(s)
          ? 'Firefox'
          : /Chrome|CriOS/i.test(s)
            ? 'Chrome'
            : /Safari/i.test(s)
              ? 'Safari'
              : /curl|python|bot|spider|crawl|http/i.test(s)
                ? 'Robot'
                : 'Navigateur';
  return `${os} · ${browser}`;
}

/**
 * D'où vient un visiteur de la vitrine : « ?src=linkedin » dans le lien en priorité,
 * sinon la page précédente (referrer), sinon « direct ».
 * Astuce : WhatsApp et beaucoup d'apps n'envoient pas de referrer → partager teliyaa.com/?src=whatsapp
 */
const REFERRERS = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/(^|\.)facebook\.com$|^fb\.me$|(^|\.)fb\.com$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, 'whatsapp'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(twitter|x)\.com$|^t\.co$/, 'x'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing']
];
export function sourceOf(src, referrer, ownHost = '') {
  const s = String(src ?? '').trim().toLowerCase();
  if (/^[a-z0-9_-]{1,30}$/.test(s)) return s;
  let host = '';
  try {
    host = new URL(String(referrer ?? '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'direct';
  }
  if (!host || (ownHost && host === ownHost.replace(/^www\./, ''))) return 'direct';
  for (const [re, name] of REFERRERS) if (re.test(host)) return name;
  return host.slice(0, 60);
}

/**
 * Note un événement. N'échoue jamais (un problème de journal ne doit pas bloquer l'utilisateur).
 * @param ctx { user, ip, ua } de la requête
 */
export async function track(ctx, type, { target = null, meta = null, userId } = {}) {
  try {
    await pool.query(`insert into events (user_id, type, target, ip, device, meta) values ($1, $2, $3, $4, $5, $6)`, [
      userId !== undefined ? userId : (ctx?.user?.id ?? null),
      type,
      target === null ? null : String(target).slice(0, 120),
      ctx?.ip ?? null,
      deviceOf(ctx?.ua),
      meta ? JSON.stringify(meta) : null
    ]);
  } catch (e) {
    console.error('Journal :', e.message);
  }
}

/** Dernière visite (au plus une mise à jour toutes les 30 min par session, avec un événement « visit »). */
export async function touchSession(ctx) {
  const { user, ip, ua } = ctx;
  if (!user?.tokenHash) return;
  try {
    const { rowCount } = await pool.query(
      `update sessions set last_seen_at = now(), last_ip = $2, device = $3
        where token_hash = $1 and (last_seen_at is null or last_seen_at < now() - interval '30 minutes')`,
      [user.tokenHash, ip, deviceOf(ua)]
    );
    if (rowCount) {
      await pool.query(`update users set last_seen_at = now() where id = $1`, [user.id]);
      await track(ctx, 'visit');
    }
  } catch (e) {
    console.error('Dernière visite :', e.message);
  }
}

/**
 * Règles de détection (sur les dernières 24 h). Chaque règle renvoie des lignes
 * { subject, user_id, ip, detail, hits }. Les seuils sont volontairement simples : à ajuster à l'usage.
 */
export const RULES = [
  {
    id: 'same_target',
    label: 'Consulte la même personne en boucle',
    sql: `select 'user:' || e.user_id || ':' || e.target as subject, e.user_id, null as ip,
                 case when e.type = 'search' then 'Recherche « ' || e.target || ' »' else 'Profil @' || e.target end
                   || ' ' || count(*) || ' fois en 24 h' as detail,
                 count(*)::int as hits
            from events e
           where e.type in ('profile_view', 'search') and e.user_id is not null and e.target is not null
             and e.created_at > now() - interval '24 hours'
           group by e.user_id, e.type, e.target
          having count(*) >= 10`
  },
  {
    id: 'many_profiles',
    label: 'Parcourt beaucoup de profils (aspiration ?)',
    // Connecté : compté par compte ; sans compte : compté par adresse IP
    sql: `select x.subject, (array_agg(x.user_id))[1] as user_id, max(x.ip) as ip,
                 count(distinct x.target) || ' profils ou recherches différents en 24 h' as detail,
                 count(distinct x.target)::int as hits
            from (select coalesce('user:' || e.user_id, 'ip:' || e.ip) as subject, e.user_id, e.ip, e.target
                    from events e
                   where e.type in ('profile_view', 'search') and e.created_at > now() - interval '24 hours') x
           group by x.subject
          having count(distinct x.target) >= 80`
  },
  {
    id: 'contacts_volume',
    label: 'Compare énormément de numéros',
    sql: `select 'user:' || e.user_id as subject, e.user_id, max(e.ip) as ip,
                 sum((e.meta->>'count')::int) || ' numéros comparés en 24 h' as detail,
                 sum((e.meta->>'count')::int)::int as hits
            from events e
           where e.type = 'contacts_match' and e.user_id is not null and e.created_at > now() - interval '24 hours'
           group by e.user_id
          having sum((e.meta->>'count')::int) >= 3000`
  },
  {
    id: 'pin_attacks',
    label: 'Codes PIN faux à répétition',
    sql: `select 'user:' || e.user_id as subject, e.user_id, max(e.ip) as ip,
                 count(*) filter (where e.type = 'pin_fail') || ' PIN faux, ' ||
                 count(*) filter (where e.type = 'pin_lockout') || ' blocage(s) en 24 h' as detail,
                 count(*)::int as hits
            from events e
           where e.type in ('pin_fail', 'pin_lockout') and e.user_id is not null and e.created_at > now() - interval '24 hours'
           group by e.user_id
          having count(*) filter (where e.type = 'pin_lockout') >= 1 or count(*) >= 6`
  },
  {
    id: 'otp_guess',
    label: 'Codes WhatsApp faux sur un numéro',
    sql: `select 'phone:' || e.target as subject, (select id from users where phone = e.target) as user_id, max(e.ip) as ip,
                 count(*) || ' codes faux pour ' || e.target || ' en 24 h' as detail, count(*)::int as hits
            from events e
           where e.type = 'otp_fail' and e.created_at > now() - interval '24 hours'
           group by e.target
          having count(*) >= 6`
  },
  {
    id: 'otp_many_numbers',
    label: 'Une adresse IP demande des codes pour beaucoup de numéros',
    sql: `select 'ip:' || e.ip as subject, null::uuid as user_id, e.ip,
                 'Codes demandés pour ' || count(distinct e.target) || ' numéros différents en 24 h' as detail,
                 count(distinct e.target)::int as hits
            from events e
           where e.type = 'otp_request' and e.created_at > now() - interval '24 hours'
           group by e.ip
          having count(distinct e.target) >= 5`
  },
  {
    id: 'many_signups',
    label: 'Beaucoup de comptes créés depuis la même adresse IP',
    sql: `select 'ip:' || e.ip as subject, null::uuid as user_id, e.ip,
                 count(*) || ' comptes créés en 24 h' as detail, count(*)::int as hits
            from events e
           where e.type = 'signup' and e.created_at > now() - interval '24 hours'
           group by e.ip
          having count(*) >= 5`
  }
];

export const RULE_LABELS = Object.fromEntries(RULES.map((r) => [r.id, r.label]));

/** Passe toutes les règles et enregistre (ou met à jour) les suspects du jour. */
export async function detectSuspects() {
  for (const rule of RULES) {
    try {
      const { rows } = await pool.query(rule.sql);
      for (const r of rows) {
        await pool.query(
          `insert into suspects (rule, subject, user_id, ip, detail, hits)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (rule, subject, day) do update
             set detail = excluded.detail, hits = excluded.hits, updated_at = now(),
                 -- classé « rien à signaler » mais ça continue fort : on rouvre
                 status = case when suspects.status = 'cleared' and excluded.hits >= suspects.hits * 2 then 'open' else suspects.status end`,
          [rule.id, r.subject, r.user_id, r.ip, r.detail, r.hits]
        );
      }
    } catch (e) {
      console.error(`Règle ${rule.id} :`, e.message);
    }
  }
}
