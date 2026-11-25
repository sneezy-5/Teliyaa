import assert from 'node:assert/strict';
import { test } from 'node:test';

// pin.js importe db.js, qui lit la config : valeurs factices (aucune connexion n'est ouverte ici)
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.APP_SECRET ??= 'x'.repeat(32);
const { hashPin, isWeakPin, pinMatches, requireValidPin } = await import('./pin.js');

test('le PIN est enregistré sous forme d’empreinte et se vérifie', async () => {
  const stored = await hashPin('2580');
  assert.ok(stored.startsWith('scrypt$'));
  assert.ok(!stored.includes('2580'));
  assert.equal(await pinMatches('2580', stored), true);
  assert.equal(await pinMatches('2581', stored), false);
  assert.equal(await pinMatches('2580', 'n’importe quoi'), false);
});

test('deux empreintes du même code sont différentes (sel aléatoire)', async () => {
  assert.notEqual(await hashPin('2580'), await hashPin('2580'));
});

test('codes refusés', () => {
  for (const weak of ['0000', '1111', '1234', '4321', '9876']) assert.equal(isWeakPin(weak), true, weak);
  assert.equal(isWeakPin('2580'), false);
  assert.throws(() => requireValidPin('12a4'));
  assert.throws(() => requireValidPin('12345'));
  assert.throws(() => requireValidPin('1234'));
  assert.equal(requireValidPin('2580'), '2580');
});
