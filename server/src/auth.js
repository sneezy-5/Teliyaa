import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { pool, tx } from './db.js';
import { HttpError } from './http.js';
import { RESET_WINDOW_SQL } from './pin.js';
import { sendCode } from './sms.js';

/**
 * Connexion sans mot de passe :
 * 1. POST /api/auth/code    → un code à 6 chiffres part par WhatsApp (ou SMS)
 * 2. POST /api/auth/verify  → si le code est bon : compte créé au besoin + jeton de session
 * Le code et le jeton ne sont jamais stockés en clair.
 */

const CODE_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = 180;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const codeHash = (phone, code) => createHmac('sha256', config.secret).update(`${phone}:${code}`).digest('hex');

/**
 * Compte de test pour la vérification Play Store / App Store (désactivé si vide) :
 * REVIEW_PHONE=+2250100000000 et REVIEW_CODE=6 chiffres dans deploy.env.
 * Pour ce numéro, aucun message n'est envoyé et seul REVIEW_CODE est accepté.
 */
const REVIEW_PHONE = process.env.REVIEW_PHONE || '';
const REVIEW_CODE = process.env.REVIEW_CODE || '';
const isReview = (phone) => Boolean(REVIEW_PHONE) && /^\d{6}$/.test(REVIEW_CODE) && phone === REVIEW_PHONE;

const BLOCKED_MESSAGE = 'Ce compte est suspendu. Écris à contact@teliyaa.com pour en savoir plus.';

async function refuseIfBlocked(phone) {
  const { rows } = await pool.query(`select 1 from users where phone = $1 and blocked_at is not null`, [phone]);
  if (rows[0]) throw new HttpError(403, BLOCKED_MESSAGE);
}

export async function requestCode(phone, ip) {
  await refuseIfBlocked(phone);
  if (isReview(phone)) return;
  // Limites par numéro : 3 codes / 15 min, 10 / jour
  const { rows } = await pool.query(
    `select count(*) filter (where created_at > now() - interval '15 minutes')::int as recent,
            count(*) filter (where created_at > now() - interval '1 day')::int as today
       from otp_sends where phone = $1`,
    [phone]
  );
  if (rows[0].recent >= 3) throw new HttpError(429, 'Trop de codes demandés. Réessaie dans 15 minutes.');
  if (rows[0].today >= 10) throw new HttpError(429, 'Trop de codes demandés aujourd’hui. Réessaie demain.');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await pool.query(
    `insert into otp_codes (phone, code_hash, attempts, expires_at)
     values ($1, $2, 0, now() + make_interval(mins => $3))
     on conflict (phone) do update set code_hash = excluded.code_hash, attempts = 0,
       expires_at = excluded.expires_at, created_at = now()`,
    [phone, codeHash(phone, code), CODE_TTL_MIN]
  );
  await pool.query(`insert into otp_sends (phone, ip) values ($1, $2)`, [phone, ip]);

  try {
    await sendCode(phone, code);
  } catch (e) {
    console.error('Envoi du code impossible :', e.message);
    await pool.query(`delete from otp_codes where phone = $1`, [phone]);
    throw new HttpError(502, "Impossible d'envoyer le code pour le moment. Réessaie dans un instant.");
  }
}

export async function verifyCode(phone, code) {
  if (!/^\d{6}$/.test(String(code ?? ''))) throw new HttpError(400, 'Le code a 6 chiffres.');

  if (isReview(phone)) {
    const ok = timingSafeEqual(Buffer.from(String(code)), Buffer.from(REVIEW_CODE));
    if (!ok) throw new HttpError(400, 'Code incorrect.');
    return openSession(phone);
  }

  const { rows } = await pool.query(`select code_hash, attempts, expires_at > now() as valid from otp_codes where phone = $1`, [phone]);
  const row = rows[0];
  if (!row || !row.valid) throw new HttpError(400, 'Code incorrect ou expiré. Demande un nouveau code.');
  if (row.attempts >= MAX_ATTEMPTS) {
    await pool.query(`delete from otp_codes where phone = $1`, [phone]);
    throw new HttpError(429, 'Trop d’essais. Demande un nouveau code.');
  }

  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(codeHash(phone, String(code)), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await pool.query(`update otp_codes set attempts = attempts + 1 where phone = $1`, [phone]);
    throw new HttpError(400, 'Code incorrect.');
  }

  await pool.query(`delete from otp_codes where phone = $1`, [phone]);
  return openSession(phone);
}

/** Crée le compte au besoin et ouvre une session. */
function openSession(phone) {
  return tx(async (db) => {
    const user = (
      await db.query(
        `insert into users (phone) values ($1)
         on conflict (phone) do update set phone = excluded.phone
         returning id, phone, pin_hash is not null as has_pin, blocked_at is not null as blocked, (xmax = 0) as is_new`,
        [phone]
      )
    ).rows[0];
    if (user.blocked) throw new HttpError(403, BLOCKED_MESSAGE);
    delete user.blocked;
    user.pin_ok = false; // le PIN est demandé juste après
    const token = randomBytes(32).toString('base64url');
    await db.query(
      `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
      [sha256(token), user.id, SESSION_DAYS]
    );
    return { token, user };
  });
}

/** Utilisateur connecté d'après l'en-tête « Authorization: Bearer … », ou null. */
export async function userFromRequest(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length > 200) return null;
  const { rows } = await pool.query(
    `select u.id, u.phone, u.pin_hash is not null as has_pin, s.pin_ok,
            s.created_at > now() - interval '${RESET_WINDOW_SQL}' as fresh
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and u.blocked_at is null`,
    [sha256(token)]
  );
  if (!rows[0]) return null;
  return { ...rows[0], tokenHash: sha256(token), is_admin: config.adminPhones.includes(rows[0].phone) };
}

export async function logout(user) {
  if (user?.tokenHash) await pool.query(`delete from sessions where token_hash = $1`, [user.tokenHash]);
}
