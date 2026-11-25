import { Capacitor } from '@capacitor/core';
import { reactive } from 'vue';
import { session } from './session';

/**
 * Code PIN (4 chiffres), vérifié par le serveur :
 * - après le code WhatsApp, le serveur refuse l'accès aux données tant que le PIN n'est pas tapé ;
 * - l'app se reverrouille à l'ouverture et après une absence ; on rouvre avec le PIN
 *   ou, dans l'app Android / iPhone, avec l'empreinte digitale ou le visage.
 */
export const PIN_LENGTH = 4;
/**
 * Au-delà de cette absence (app en arrière-plan), on redemande le code.
 * 2 minutes : le temps de payer dans Wave et revenir sans retaper le code.
 */
export const LOCK_AFTER_MS = 2 * 60_000;

/** État partagé de l'écran de verrouillage */
export const pinState = reactive({
  /** Déverrouillé sur cet écran (repasse à false à l'ouverture et après une absence) */
  unlocked: false,
  /** Changement de code demandé depuis le profil */
  changing: false
});

/** Pages qui restent ouvertes sans PIN (pages publiques et connexion) */
const PUBLIC = [/^\/u\//, /^\/r\//, /^\/confidentialite/, /^\/conditions/, /^\/login/];
export const isPublicPath = (path: string) => PUBLIC.some((re) => re.test(path));

/** L'écran du code doit-il s'afficher sur cette page ? */
export function needsPin(path: string): boolean {
  const user = session.user;
  if (!user || session.loading || isPublicPath(path)) return false;
  return !user.has_pin || !user.pin_ok || !pinState.unlocked || pinState.changing;
}

/** Le serveur refuse encore les données : on ne montre pas la page derrière l'écran du code. */
export function dataLocked(path: string): boolean {
  const user = session.user;
  if (!user || isPublicPath(path)) return false;
  return !user.has_pin || !user.pin_ok;
}

/** Codes trop faciles à deviner (le serveur les refuse aussi) */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 1111…
  return '01234567890'.includes(pin) || '09876543210'.includes(pin); // 1234, 4321…
}

// ---------- Code oublié ----------
// On note la demande, on déconnecte ; après le code WhatsApp, l'écran propose directement un nouveau code.
const RESET_KEY = 'teliyaa-pin-reset';
export const resetRequested = () => readFlag(RESET_KEY);
export const setResetRequested = (on: boolean) => writeFlag(RESET_KEY, on);

// ---------- Empreinte digitale / visage (app installée seulement) ----------
const bioKey = (uid: string) => `teliyaa-bio-v1:${uid}`;
export const biometricEnabled = (uid: string) => readFlag(bioKey(uid));
export const setBiometricEnabled = (uid: string, on: boolean) => writeFlag(bioKey(uid), on);

/** Le téléphone a-t-il une empreinte ou un visage enregistré ? */
export async function biometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    return (await NativeBiometric.isAvailable()).isAvailable;
  } catch {
    return false;
  }
}

/** Demande l'empreinte ou le visage. true si c'est bien le propriétaire du téléphone. */
export async function biometricVerify(): Promise<boolean> {
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    await NativeBiometric.verifyIdentity({ reason: 'Ouvrir Teliyaa', title: 'Ouvrir Teliyaa', subtitle: '', description: '' });
    return true;
  } catch {
    return false; // annulé ou échoué : on garde le PIN
  }
}

/** Reverrouille quand l'app revient après une absence. À appeler une fois au démarrage. */
export function watchAppSwitches(now = () => Date.now()) {
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = now();
    else if (hiddenAt !== null && now() - hiddenAt > LOCK_AFTER_MS) pinState.unlocked = false;
    if (document.visibilityState === 'visible') hiddenAt = null;
  });
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* rien */
  }
}
