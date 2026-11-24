import { Capacitor } from '@capacitor/core';
import { Contacts } from '@capacitor-community/contacts';
import type { RawContact } from './contacts';

/**
 * Répertoire du téléphone dans l'app installée (Android et iPhone, via Capacitor).
 * Dans le navigateur, ces fonctions ne sont pas appelées : on passe par `pickContacts()`.
 */

export type ContactsPermission = 'granted' | 'denied' | 'prompt';

/** Vrai dans l'app installée depuis le Play Store / l'App Store, faux dans le navigateur. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

function toPermission(state: string): ContactsPermission {
  // iOS 18 : « accès limité » = l'utilisateur a choisi certains contacts, on lit ceux-là.
  if (state === 'granted' || state === 'limited') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

export async function contactsPermission(): Promise<ContactsPermission> {
  return toPermission((await Contacts.checkPermissions()).contacts);
}

/** Affiche la fenêtre système « Autoriser tonapp à accéder à vos contacts ? » (une seule fois). */
export async function requestContactsPermission(): Promise<ContactsPermission> {
  return toPermission((await Contacts.requestPermissions()).contacts);
}

/** Lit tout le répertoire : noms et numéros seulement. */
export async function readAddressBook(): Promise<RawContact[]> {
  const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
  return contacts.map((c) => ({
    name: (c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(' ')).trim(),
    phones: (c.phones ?? []).map((p) => p.number ?? '').filter(Boolean)
  }));
}
