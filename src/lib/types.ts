export type AliasType = 'phone' | 'address';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  phone: string;
  verified: boolean;
  /** Visible dans la recherche @pseudo */
  discoverable: boolean;
  /** Trouvable par ceux qui ont mon numéro dans leur répertoire */
  findable_by_phone: boolean;
  /** App utilisée en priorité pour payer (id du catalogue providers) */
  favorite_provider: string | null;
  /** public : tout le monde avec le lien ; private : seulement les personnes choisies et les liens secrets */
  visibility?: Visibility;
}

export type Visibility = 'public' | 'private';
/** Durée d'un accès : 1 h, 24 h, 7 jours, 30 jours ou sans fin */
export type ShareDuration = '1h' | '24h' | '7d' | '30d' | 'forever';

/** Personne autorisée à voir mon profil privé */
export interface ProfileGrant {
  username: string;
  full_name: string;
  expires_at: string | null;
  created_at: string;
}

/** Lien secret teliyaa.com/p/… */
export interface ShareLink {
  id: string;
  token: string;
  expires_at: string | null;
  created_at: string;
}

export interface Sharing {
  visibility: Visibility;
  grants: ProfileGrant[];
  links: ShareLink[];
}

export interface Alias {
  id: string;
  owner_id: string;
  provider_id: string;
  alias_type: AliasType;
  value: string;
  /** Banque : nom de la banque */
  label: string | null;
  /** Nom du compte choisi par la personne (« Wave perso », « Boutique ») */
  name?: string | null;
  /** Numéro auquel ce compte (Wave, Orange Money…) est rattaché, en E.164 */
  account_phone?: string | null;
  /** Numéro du compte affiché sur la page de paiement (privé par défaut) */
  account_phone_visible?: boolean;
  is_primary: boolean;
  /** Affiché sur la page publique */
  visible: boolean;
  created_at: string;
}

export type RequestStatus = 'open' | 'declared' | 'paid' | 'cancelled';

export interface PaymentRequest {
  id: string;
  code: string;
  owner_id: string;
  amount: number;
  note: string;
  alias_ids: string[];
  status: RequestStatus;
  payer_name: string | null;
  created_at: string;
  expires_at: string;
}

export type PaymentStatus = 'declared' | 'confirmed' | 'rejected';

export interface Payment {
  id: string;
  payer_id: string | null;
  payer_name: string;
  recipient_id: string;
  recipient_username: string;
  amount: number;
  note: string;
  request_code: string | null;
  provider_id: string | null;
  status: PaymentStatus;
  created_at: string;
}

/** Ce que le public voit d'un profil : jamais le téléphone de connexion. */
export interface PublicProfile {
  username: string;
  full_name: string;
  verified: boolean;
  aliases: PublicAlias[];
  /** Ouvert avec un lien secret : date de fin du lien (null = sans fin) */
  shared_until?: string | null;
}

export interface PublicAlias {
  id: string;
  provider_id: string;
  alias_type: AliasType;
  value: string;
  label: string | null;
  name?: string | null;
  account_phone?: string | null;
  is_primary: boolean;
}

/** Un contact du répertoire reconnu : `hash` est l'empreinte envoyée, `profile` la personne trouvée. */
export interface ContactMatch {
  hash: string;
  profile: PublicProfile;
}

export interface PublicRequest {
  code: string;
  amount: number;
  note: string;
  status: RequestStatus;
  expires_at: string;
  profile: PublicProfile;
}

export interface SessionUser {
  id: string;
  phone: string;
  /** Un code PIN existe pour ce compte */
  has_pin?: boolean;
  /** Le PIN a été tapé sur cette session (sinon le serveur refuse l'accès aux données) */
  pin_ok?: boolean;
  /** Accès au back-office (numéro dans ADMIN_PHONES côté serveur) */
  is_admin?: boolean;
}
