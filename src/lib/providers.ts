/**
 * Catalogue des établissements connectés à PI-SPI.
 *
 * IMPORTANT : les identifiants d'app (androidPackage, iosScheme) servent au bouton
 * « Ouvrir mon app ». Ils sont À VÉRIFIER SUR TÉLÉPHONE pour chaque établissement
 * (voir la section « Tests terrain » du plan). `verified: false` tant que ce n'est pas fait.
 * Sans identifiant, l'app propose seulement de copier l'alias.
 */
export interface Provider {
  id: string;
  name: string;
  kind: 'wallet' | 'bank';
  /** Initiales affichées dans la pastille quand il n'y a pas de logo */
  short: string;
  /**
   * Logo de l'établissement, relatif à `public/` (ex. 'logos/wave.svg').
   * Les logos sont des marques déposées : ne les ajouter qu'avec l'accord de l'établissement.
   */
  logo?: string;
  androidPackage?: string;
  iosScheme?: string;
  playStoreUrl?: string;
  appStoreUrl?: string;
  /** true quand l'ouverture a été testée sur un vrai téléphone */
  verified: boolean;
  /** Dégradé de la carte du compte (deux couleurs) et couleur du texte dessus */
  card: [string, string];
  cardInk?: string;
}

export const PROVIDERS: Provider[] = [
  { id: 'wave', name: 'Wave', kind: 'wallet', short: 'W', androidPackage: 'com.wave.personal', verified: false, card: ['#1aa7e8', '#0b6fc2'] },
  { id: 'orange-money', name: 'Orange Money', kind: 'wallet', short: 'OM', verified: false, card: ['#ff8a1f', '#e25c00'] },
  { id: 'mtn-momo', name: 'MTN MoMo', kind: 'wallet', short: 'MTN', verified: false, card: ['#ffd23f', '#f5b400'], cardInk: '#1f2937' },
  { id: 'moov-money', name: 'Moov Money', kind: 'wallet', short: 'MV', verified: false, card: ['#2563eb', '#1e3a8a'] },
  { id: 'bank', name: 'Ma banque', kind: 'bank', short: 'B', verified: false, card: ['#4338ca', '#1e1b4b'] },
  { id: 'other', name: 'Autre établissement', kind: 'bank', short: '+', verified: false, card: ['#475569', '#1e293b'] }
];

export function getProvider(id: string | null | undefined): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
}

export function aliasDisplayName(alias: { provider_id: string; label: string | null }): string {
  return alias.label?.trim() || getProvider(alias.provider_id).name;
}
