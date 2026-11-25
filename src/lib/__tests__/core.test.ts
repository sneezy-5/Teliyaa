import { describe, expect, it } from 'vitest';
import { formatAmount, formatPhone, parseAmount, shortCode, toE164, validateUsername } from '../format';
import { providerOpenUrl } from '../openApp';
import { getProvider } from '../providers';
import { demoApi, DEMO_OTP } from '../api/demo';

describe('format', () => {
  it('formate les montants en FCFA', () => {
    expect(formatAmount(15000)).toBe('15 000 FCFA');
    expect(formatAmount(1250000)).toBe('1 250 000 FCFA');
    expect(parseAmount('15 000')).toBe(15000);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
  });

  it('valide les numéros par pays', () => {
    expect(toE164('+225', '07 00 00 00 01')).toBe('+2250700000001');
    expect(toE164('+225', '0700')).toBeNull();
    expect(toE164('+221', '771234567')).toBe('+221771234567');
    expect(formatPhone('+2250700000001')).toBe('+225 07 00 00 00 01');
  });

  it('valide les pseudos', () => {
    expect(validateUsername('aminata.k')).toBeNull();
    expect(validateUsername('@Aminata.K')).toBeNull();
    expect(validateUsername('ab')).not.toBeNull();
    expect(validateUsername('.aminata')).not.toBeNull();
    expect(validateUsername('wave.officiel')).not.toBeNull();
  });

  it('génère des codes courts lisibles', () => {
    const code = shortCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe('ouverture des apps depuis le navigateur', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 13)';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)';

  it('ouvre la fiche Play Store sur Android', () => {
    expect(providerOpenUrl(getProvider('wave'), ANDROID)).toBe('https://play.google.com/store/apps/details?id=com.wave.personal');
  });
  it("ouvre l'App Store sur iPhone, ou le lien d'ouverture de l'app s'il est connu", () => {
    expect(providerOpenUrl(getProvider('wave'), IPHONE)).toBe('https://apps.apple.com/app/id1523884528');
    expect(providerOpenUrl({ ...getProvider('wave'), iosScheme: 'exemple://' }, IPHONE)).toBe('exemple://');
  });
  it("ne fait rien sur ordinateur ni pour une banque", () => {
    expect(providerOpenUrl(getProvider('wave'), 'Mozilla/5.0 (Macintosh)')).toBeNull();
    expect(providerOpenUrl(getProvider('bank'), ANDROID)).toBeNull();
  });
});

describe('parcours complet en mode démo', () => {
  it('inscription → alias → demande → paiement déclaré → confirmé', async () => {
    // Aminata (compte de démo existant) crée une demande
    await demoApi.verifyOtp('+2250700000001', DEMO_OTP);
    const aliases = await demoApi.listMyAliases();
    expect(aliases[0].is_primary).toBe(true);
    const req = await demoApi.createRequest({ amount: 15000, note: 'Tontine', alias_ids: [aliases[0].id] });

    // Koffi s'inscrit
    await demoApi.signOut();
    await expect(demoApi.verifyOtp('+2250100000009', '000000')).rejects.toThrow();
    await demoApi.verifyOtp('+2250100000009', DEMO_OTP);
    await expect(demoApi.saveMyProfile({ username: 'aminata.k', full_name: 'Koffi' })).rejects.toThrow('déjà pris');
    await demoApi.saveMyProfile({ username: 'koffi.a', full_name: 'Koffi Adjoumani' });
    const first = await demoApi.saveAlias({ provider_id: 'bank', alias_type: 'phone', value: '+2250100000009', label: null, is_primary: false, visible: true });
    expect(first.is_primary).toBe(true); // le premier alias devient principal

    // Il ouvre la demande : seul l'alias choisi par Aminata est proposé
    const pub = await demoApi.getPublicRequest(req.code.toLowerCase());
    expect(pub?.profile.aliases).toHaveLength(1);
    expect(pub?.profile).not.toHaveProperty('phone');

    // Recherche @pseudo
    const found = await demoApi.searchProfiles('@amin');
    expect(found.map((p) => p.username)).toContain('aminata.k');

    // Il déclare avoir payé
    await demoApi.declarePayment({ recipientUsername: 'aminata.k', amount: 15000, note: 'Tontine', requestCode: req.code, providerId: 'bank' });
    expect((await demoApi.listMyPayments()).sent).toHaveLength(1);

    // Aminata confirme
    await demoApi.signOut();
    await demoApi.verifyOtp('+2250700000001', DEMO_OTP);
    const { received } = await demoApi.listMyPayments();
    expect(received[0].payer_name).toBe('@koffi.a');
    expect((await demoApi.listMyRequests())[0].status).toBe('declared');
    await demoApi.setPaymentStatus(received[0].id, 'confirmed');
    expect((await demoApi.listMyRequests())[0].status).toBe('paid');
  });
});
