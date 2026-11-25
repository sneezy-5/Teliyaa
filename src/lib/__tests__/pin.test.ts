import { describe, expect, it } from 'vitest';
import { isPublicPath, isWeakPin } from '../pin';

// Le PIN est vérifié par le serveur (voir server/src/pin.test.js) : ici, seulement les règles côté app.
describe('code PIN', () => {
  it('refuse les codes trop simples', () => {
    for (const weak of ['0000', '1111', '1234', '4321', '0987']) expect(isWeakPin(weak)).toBe(true);
    expect(isWeakPin('2580')).toBe(false);
  });

  it('ne verrouille jamais les pages publiques', () => {
    expect(isPublicPath('/u/aminata.k')).toBe(true);
    expect(isPublicPath('/confidentialite')).toBe(true);
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/profile')).toBe(false);
  });
});
