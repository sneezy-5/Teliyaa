import { createHash, webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  countryCodeOf,
  emptySyncCache,
  FULL_SYNC_MS,
  hashPhone,
  inviteLink,
  mergeContacts,
  normalizeContactPhone,
  resolveContacts,
  syncAddressBook
} from './contacts';
import type { ContactMatch, PublicProfile } from './types';

beforeAll(() => {
  // Node 18 n'expose pas toujours `crypto` en global.
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

describe('normalizeContactPhone', () => {
  it('accepte les écritures courantes du répertoire', () => {
    expect(normalizeContactPhone('07 00 00 00 01', '+225')).toBe('+2250700000001');
    expect(normalizeContactPhone('+225 07-00-00-00-01', '+225')).toBe('+2250700000001');
    expect(normalizeContactPhone('00225 0700000001', '+225')).toBe('+2250700000001');
    expect(normalizeContactPhone('2250700000001', '+225')).toBe('+2250700000001');
    expect(normalizeContactPhone('+221 77 123 45 67', '+225')).toBe('+221771234567');
    expect(normalizeContactPhone('77 123 45 67', '+221')).toBe('+221771234567');
  });

  it('refuse ce qui n’est pas un numéro UEMOA valide', () => {
    expect(normalizeContactPhone('+33 6 12 34 56 78', '+225')).toBeNull();
    expect(normalizeContactPhone('0700', '+225')).toBeNull();
    expect(normalizeContactPhone('', '+225')).toBeNull();
  });
});

describe('hashPhone', () => {
  it('donne la même empreinte SHA-256 que la base', async () => {
    const expected = createHash('sha256').update('+2250700000001').digest('hex');
    expect(await hashPhone('+2250700000001')).toBe(expected);
  });
});

describe('resolveContacts', () => {
  const wave = { id: 'a1', provider_id: 'wave', alias_type: 'phone' as const, value: '+2250700000001', label: null, is_primary: true };
  const aminata: PublicProfile = { username: 'aminata.k', full_name: 'Aminata Koné', verified: true, aliases: [wave] };

  it('sépare les inscrits des autres et ignore les numéros invalides', async () => {
    const target = await hashPhone('+2250700000001');
    const sent: string[][] = [];
    const find = async (hashes: string[]): Promise<ContactMatch[]> => {
      sent.push(hashes);
      return hashes.includes(target) ? [{ hash: target, profile: aminata }] : [];
    };
    const { contacts, skipped } = await resolveContacts(
      [
        { name: 'Zoé', phones: ['05 11 22 33 44'] },
        { name: 'Ami', phones: ['+225 07 00 00 00 01', '0700000001'] },
        { name: 'Cousin France', phones: ['+33612345678'] }
      ],
      '+225',
      find
    );
    expect(skipped).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(2); // doublon du même numéro envoyé une seule fois
    expect(contacts).toEqual([
      { name: 'Ami', phone: '+2250700000001', match: { username: 'aminata.k', full_name: 'Aminata Koné', verified: true, aliases: [wave] } },
      { name: 'Zoé', phone: '+2250511223344', match: null }
    ]);
  });

  it('répertoire complet : n’envoie que les nouveaux numéros, puis tout une fois par jour', async () => {
    const target = await hashPhone('+2250700000001');
    const sent: number[] = [];
    const find = async (hashes: string[]): Promise<ContactMatch[]> => {
      sent.push(hashes.length);
      return hashes.includes(target) ? [{ hash: target, profile: aminata }] : [];
    };
    const book = [
      { name: 'Ami', phones: ['0700000001'] },
      { name: 'Zoé', phones: ['0511223344'] }
    ];
    const t0 = new Date('2026-11-24T08:00:00Z');

    const first = await syncAddressBook(book, '+225', emptySyncCache(), find, t0);
    expect(first.queried).toBe(2);
    expect(first.contacts.map((c) => c.match?.username ?? null)).toEqual(['aminata.k', null]);

    // Une heure plus tard, un nouveau contact et un contact supprimé (Zoé)
    const later = new Date(t0.getTime() + 3600e3);
    const second = await syncAddressBook([book[0], { name: 'Paul', phones: ['0122334455'] }], '+225', first.cache, find, later);
    expect(second.queried).toBe(1);
    expect(second.contacts.map((c) => c.name)).toEqual(['Ami', 'Paul']);
    expect(second.contacts[0].match?.aliases).toEqual([wave]);
    expect(Object.keys(second.cache.index)).not.toContain('+2250511223344');

    // Le lendemain : tout est revérifié
    const nextDay = new Date(t0.getTime() + FULL_SYNC_MS);
    const third = await syncAddressBook(book, '+225', second.cache, find, nextDay);
    expect(third.queried).toBe(2);
    expect(sent).toEqual([2, 1, 2]);
  });

  it('envoie les empreintes par lots de 500', async () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({ name: `C${i}`, phones: [`07${String(i).padStart(8, '0')}`] }));
    const sizes: number[] = [];
    await resolveContacts(many, '+225', async (h) => (sizes.push(h.length), []));
    expect(sizes).toEqual([500, 500, 200]);
  });
});

describe('mergeContacts', () => {
  it('remplace un même numéro par sa version la plus récente', () => {
    const old = [{ name: 'Ami', phone: '+2250700000001', match: null }];
    const fresh = [{ name: 'Ami', phone: '+2250700000001', match: { username: 'aminata.k', full_name: 'Aminata Koné', verified: true, aliases: [] } }];
    expect(mergeContacts(old, fresh)).toEqual(fresh);
  });
});

describe('divers', () => {
  it('déduit le pays du numéro de connexion', () => {
    expect(countryCodeOf('+221771234567')).toBe('+221');
    expect(countryCodeOf(undefined)).toBe('+225');
  });

  it('prépare l’invitation WhatsApp vers le bon numéro', () => {
    expect(inviteLink('+2250700000001', 'https://tonapp.link/u/moi')).toMatch(/^https:\/\/wa\.me\/2250700000001\?text=.*tonapp\.link%2Fu%2Fmoi$/);
  });
});
