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
}

export interface Alias {
  id: string;
  owner_id: string;
  provider_id: string;
  alias_type: AliasType;
  value: string;
  label: string | null;
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
}

export interface PublicAlias {
  id: string;
  provider_id: string;
  alias_type: AliasType;
  value: string;
  label: string | null;
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
}
