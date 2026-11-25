import assert from 'node:assert/strict';
import { test } from 'node:test';

// audit.js importe db.js, qui lit la config : valeurs factices (aucune connexion n'est ouverte ici)
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.APP_SECRET ??= 'x'.repeat(32);
const { deviceOf, RULES } = await import('./audit.js');

test('reconnaît le type d’appareil', () => {
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), 'Android · Chrome');
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), 'App Android');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120'), 'Windows · Edge');
  assert.equal(deviceOf('curl/8.4.0'), 'Autre · Robot');
  assert.equal(deviceOf(''), 'Inconnu');
});

test('chaque règle de détection a un identifiant unique et un libellé', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of RULES) assert.ok(r.label && r.sql.includes('subject'));
});
