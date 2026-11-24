import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aliasInput, isUemoaPhone, normalizeUsername, usernameError } from './validate.js';

test('numéros UEMOA', () => {
  assert.equal(isUemoaPhone('+2250700000001'), true);
  assert.equal(isUemoaPhone('+221771234567'), true);
  assert.equal(isUemoaPhone('+22507000'), false);
  assert.equal(isUemoaPhone('+33612345678'), false);
  assert.equal(isUemoaPhone('2250700000001'), false);
});

test('pseudos', () => {
  assert.equal(usernameError(normalizeUsername('@Aminata.K')), null);
  assert.notEqual(usernameError('ab'), null);
  assert.notEqual(usernameError('.aminata'), null);
  assert.notEqual(usernameError('teliyaa'), null);
  assert.notEqual(usernameError('wave.officiel'), null);
});

test('alias', () => {
  assert.deepEqual(aliasInput({ provider_id: 'wave', alias_type: 'phone', value: '+2250700000001' }), {
    provider_id: 'wave',
    alias_type: 'phone',
    value: '+2250700000001',
    label: null,
    is_primary: false,
    visible: true
  });
  assert.throws(() => aliasInput({ provider_id: 'wave', alias_type: 'phone', value: '0700' }));
  assert.throws(() => aliasInput({ provider_id: 'Wave!', alias_type: 'address', value: 'abcd-1234' }));
  assert.equal(aliasInput({ provider_id: 'bank', alias_type: 'address', value: 'abcd-1234', label: 'SIB' }).label, 'SIB');
});
