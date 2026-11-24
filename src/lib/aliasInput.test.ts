import { describe, expect, it } from 'vitest';
import { parseAliasInput } from './aliasInput';

describe('parseAliasInput', () => {
  it('reconnaît un numéro, quelle que soit son écriture', () => {
    expect(parseAliasInput('07 00 00 00 01', '+225')).toEqual({ ok: true, type: 'phone', value: '+2250700000001' });
    expect(parseAliasInput('+225 07-00-00-00-01', '+225')).toEqual({ ok: true, type: 'phone', value: '+2250700000001' });
    expect(parseAliasInput('77 123 45 67', '+221')).toEqual({ ok: true, type: 'phone', value: '+221771234567' });
  });

  it('signale un numéro incomplet', () => {
    expect(parseAliasInput('0700', '+225').ok).toBe(false);
  });

  it('garde une adresse de paiement telle quelle', () => {
    expect(parseAliasInput('  3f2a9c1e-77ab-4c1d  ', '+225')).toEqual({ ok: true, type: 'address', value: '3f2a9c1e-77ab-4c1d' });
  });

  it('refuse un champ vide ou trop court', () => {
    expect(parseAliasInput('', '+225').ok).toBe(false);
    expect(parseAliasInput('ab', '+225').ok).toBe(false);
  });
});
