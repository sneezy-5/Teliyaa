import type {
  Alias,
  ContactMatch,
  Payment,
  PaymentRequest,
  Profile,
  PublicProfile,
  PublicRequest,
  RequestStatus,
  SessionUser,
  ShareDuration,
  ShareLink,
  Sharing,
  Visibility
} from '../types';

export interface AliasInput {
  id?: string;
  provider_id: string;
  alias_type: Alias['alias_type'];
  value: string;
  label: string | null;
  is_primary: boolean;
  visible: boolean;
}

export interface DeclarePaymentInput {
  recipientUsername: string;
  amount: number;
  note: string;
  requestCode?: string | null;
  providerId?: string | null;
  /** Nom saisi par un payeur sans compte (page publique) */
  payerName?: string;
}

/**
 * Tout ce dont les écrans ont besoin. Deux implémentations :
 * - demo.ts : stockage dans le navigateur (aucun serveur)
 * - supabase.ts : vraie base de données + SMS
 */
export interface Api {
  readonly mode: 'demo' | 'supabase' | 'server';

  // Connexion
  getSessionUser(): Promise<SessionUser | null>;
  onAuthChange(cb: (user: SessionUser | null) => void): () => void;
  sendOtp(phoneE164: string): Promise<void>;
  verifyOtp(phoneE164: string, code: string): Promise<SessionUser>;
  signOut(): Promise<void>;
  /** Supprime définitivement le compte, le profil et les comptes (alias). */
  deleteAccount(): Promise<void>;

  // Code PIN (vérifié par le serveur)
  /** Déverrouille la session. Erreur « Code incorrect. N essais restants. » sinon. */
  verifyPin(pin: string): Promise<void>;
  /** Premier code, ou changement (`current` = ancien code) */
  setPin(pin: string, current?: string): Promise<void>;
  /** Code oublié : seulement juste après une connexion avec le code WhatsApp */
  resetPin(pin: string): Promise<void>;

  // Profil
  getMyProfile(): Promise<Profile | null>;
  saveMyProfile(input: Pick<Profile, 'username' | 'full_name'> & Partial<Pick<Profile, 'discoverable' | 'findable_by_phone' | 'favorite_provider'>>): Promise<Profile>;
  isUsernameAvailable(username: string): Promise<boolean>;

  // Qui peut voir mon profil
  getSharing(): Promise<Sharing>;
  setVisibility(visibility: Visibility): Promise<Sharing>;
  addGrant(username: string, duration: ShareDuration): Promise<Sharing>;
  removeGrant(username: string): Promise<Sharing>;
  createShareLink(duration: ShareDuration): Promise<{ link: ShareLink; sharing: Sharing }>;
  deleteShareLink(id: string): Promise<Sharing>;
  /** Profil ouvert avec un lien secret (null : lien expiré ou supprimé) */
  getSharedProfile(token: string): Promise<PublicProfile | null>;

  // Alias
  listMyAliases(): Promise<Alias[]>;
  saveAlias(input: AliasInput): Promise<Alias>;
  deleteAlias(id: string): Promise<void>;

  // Demandes de paiement
  createRequest(input: { amount: number; note: string; alias_ids: string[] }): Promise<PaymentRequest>;
  listMyRequests(): Promise<PaymentRequest[]>;
  setRequestStatus(id: string, status: RequestStatus): Promise<void>;

  // Pages publiques (sans compte)
  getPublicProfile(username: string): Promise<PublicProfile | null>;
  getPublicRequest(code: string): Promise<PublicRequest | null>;
  searchProfiles(query: string): Promise<PublicProfile[]>;
  /** Contacts du répertoire : empreintes SHA-256 de numéros E.164 → profils trouvables (500 max par appel). */
  findContacts(phoneHashes: string[]): Promise<ContactMatch[]>;

  // Paiements déclarés (l'argent passe par l'app du payeur, pas par nous)
  declarePayment(input: DeclarePaymentInput): Promise<Payment>;
  listMyPayments(): Promise<{ sent: Payment[]; received: Payment[] }>;
  setPaymentStatus(id: string, status: 'confirmed' | 'rejected'): Promise<void>;
}
