import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

/** Crée / met à jour les tables. Attend que PostgreSQL soit prêt (démarrage Docker). */
export async function initDb() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query(sql);
      return;
    } catch (e) {
      const notReady = ['ECONNREFUSED', 'ENOTFOUND', '57P03'].includes(e.code);
      if (!notReady || attempt >= 30) throw e;
      console.log(`Base pas encore prête, nouvel essai (${attempt}/30)…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Exécute `fn` dans une transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Ménage régulier : codes et sessions expirés, vieux historiques. */
export async function cleanup() {
  await pool.query(`delete from otp_codes where expires_at < now()`);
  await pool.query(`delete from otp_sends where created_at < now() - interval '2 days'`);
  await pool.query(`delete from sessions where expires_at < now()`);
  await pool.query(`delete from contact_lookups where created_at < now() - interval '2 days'`);
}
