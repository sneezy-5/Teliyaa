import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pool, tx } from './db.js';
import { HttpError } from './http.js';

/**
 * Code PIN à 4 chiffres, vérifié par le serveur :
 * - seule une empreinte scrypt (sel aléatoire) est enregistrée ;
 * - une session ouverte avec le code WhatsApp n'a accès aux données qu'après le bon PIN ;
 * - 5 erreurs de suite → toutes les sessions du compte sont fermées.
 */
const scryptAsync = promisify(scrypt);
export const PIN_MAX_FAILURES = 5;
/** « Code oublié » : possible seulement juste après une connexion avec le code WhatsApp */
const RESET_WINDOW_MIN = 15;

export async function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function pinMatches(pin, stored) {
  const [kind, saltHex, hashHex] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const given = await scryptAsync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, given);
}

/** Codes trop faciles : 0000, 1111, 1234, 4321… */
export function isWeakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return true;
  return '01234567890'.includes(pin) || '09876543210'.includes(pin);
}

export function requireValidPin(value) {
  const pin = String(value ?? '');
  if (!/^\d{4}$/.test(pin)) throw new HttpError(400, 'Le code doit faire 4 chiffres.');
  if (isWeakPin(pin)) throw new HttpError(400, 'Code trop facile à deviner. Choisis-en un autre.');
  return pin;
}

const plural = (n) => `${n} essai${n > 1 ? 's' : ''} restant${n > 1 ? 's' : ''}`;

/**
 * Vérifie le PIN d'un compte (compte les erreurs). Renvoie true, ou lève une erreur.
 * À la 5e erreur, toutes les sessions sont fermées (401 → l'app revient à la connexion).
 */
async function checkAndCount(db, userId, pin) {
  const row = (await db.query(`select pin_hash, pin_failures from users where id = $1 for update`, [userId])).rows[0];
  if (!row?.pin_hash) throw new HttpError(400, "Tu n'as pas encore de code.");
  if (await pinMatches(String(pin ?? ''), row.pin_hash)) {
    if (row.pin_failures) await db.query(`update users set pin_failures = 0 where id = $1`, [userId]);
    return true;
  }
  const failures = row.pin_failures + 1;
  if (failures >= PIN_MAX_FAILURES) {
    await db.query(`update users set pin_failures = 0 where id = $1`, [userId]);
    await db.query(`delete from sessions where user_id = $1`, [userId]);
    return 'locked';
  }
  await db.query(`update users set pin_failures = $2 where id = $1`, [userId, failures]);
  return PIN_MAX_FAILURES - failures;
}

function throwFailure(result) {
  if (result === 'locked') throw new HttpError(401, 'Trop d’essais. Reconnecte-toi avec le code reçu sur WhatsApp.');
  throw new HttpError(400, `Code incorrect. ${plural(result)}.`);
}

/** Déverrouille la session avec le PIN. */
export async function verifyPin(user, pin) {
  // checkAndCount renvoie (sans lever d'erreur) : la transaction est validée et le compteur d'erreurs enregistré.
  const result = await tx((db) => checkAndCount(db, user.id, pin));
  if (result !== true) throwFailure(result);
  await pool.query(`update sessions set pin_ok = true where token_hash = $1`, [user.tokenHash]);
}

/** Premier code, ou changement (il faut alors l'ancien code). */
export async function setPin(user, pin, current) {
  const fresh = requireValidPin(pin);
  if (user.has_pin) {
    const result = await tx((db) => checkAndCount(db, user.id, current));
    if (result !== true) throwFailure(result);
  }
  const hash = await hashPin(fresh);
  await tx(async (db) => {
    await db.query(`update users set pin_hash = $2, pin_failures = 0 where id = $1`, [user.id, hash]);
    await db.query(`update sessions set pin_ok = true where token_hash = $1`, [user.tokenHash]);
  });
}

/**
 * Code oublié : on vient de prouver qu'on a le numéro (code WhatsApp il y a moins de 15 min).
 * Nouveau code, et toutes les autres sessions sont fermées (le vrai propriétaire le remarquera).
 */
export async function resetPin(user, pin) {
  const fresh = requireValidPin(pin);
  if (!user.fresh) throw new HttpError(403, 'Pour changer un code oublié, reconnecte-toi avec le code reçu sur WhatsApp.');
  const hash = await hashPin(fresh);
  await tx(async (db) => {
    await db.query(`update users set pin_hash = $2, pin_failures = 0 where id = $1`, [user.id, hash]);
    await db.query(`delete from sessions where user_id = $1 and token_hash <> $2`, [user.id, user.tokenHash]);
    await db.query(`update sessions set pin_ok = true where token_hash = $1`, [user.tokenHash]);
  });
}

export const RESET_WINDOW_SQL = `${RESET_WINDOW_MIN} minutes`;
