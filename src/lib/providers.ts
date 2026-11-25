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
   * Logo de l'établissement, relatif à `public/`, SANS extension (ex. 'logos/wave').
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

/**
 * Logos déposés dans public/logos/, nommés comme l'identifiant : wave, orange-money, mtn-momo, moov-money.
 * Le format est libre (png, svg, jpg, jpeg, webp) : on essaie chaque extension. Sans fichier : initiales.
 */
const logo = (id: string) => `logos/${id}`;
export const LOGO_EXTENSIONS = ['png', 'svg', 'jpg', 'jpeg', 'webp'] as const;

/** Adresse du logo pour l'essai n° `attempt` (null quand tous les formats ont échoué) */
export function logoUrl(provider: Provider, attempt: number): string | null {
  if (!provider.logo || attempt >= LOGO_EXTENSIONS.length) return null;
  return `${import.meta.env.BASE_URL}${provider.logo}.${LOGO_EXTENSIONS[attempt]}`;
}

const play = (id: string) => `https://play.google.com/store/apps/details?id=${id}`;

export const PROVIDERS: Provider[] = [
  {
    id: 'wave', name: 'Wave', kind: 'wallet', short: 'W', verified: true, card: ['#1aa7e8', '#0b6fc2'], logo: logo('wave'),
    androidPackage: 'com.wave.personal', playStoreUrl: play('com.wave.personal'),
    appStoreUrl: 'https://apps.apple.com/app/id1523884528'
  },
  {
    // « Orange Money Afrique » (Orange SA)
    id: 'orange-money', name: 'Orange Money', kind: 'wallet', short: 'OM', verified: false, card: ['#ff8a1f', '#e25c00'], logo: logo('orange-money'),
    androidPackage: 'com.orange.orangemoneyafrique', playStoreUrl: play('com.orange.orangemoneyafrique'),
    appStoreUrl: 'https://apps.apple.com/app/id1313536959'
  },
  {
    // « MoMo App » (MTN Group Fintech) — Play Store confirmé ; App Store à vérifier
    id: 'mtn-momo', name: 'MTN MoMo', kind: 'wallet', short: 'MTN', verified: false, card: ['#ffd23f', '#f5b400'], cardInk: '#1f2937', logo: logo('mtn-momo'),
    androidPackage: 'mtnft.momo.consumer', playStoreUrl: play('mtnft.momo.consumer'),
    appStoreUrl: 'https://apps.apple.com/app/id6532622230'
  },
  {
    // « Moov Money CI » (Moov Africa CI) — Play Store confirmé ; pas encore de lien App Store
    id: 'moov-money', name: 'Moov Money', kind: 'wallet', short: 'MV', verified: false, card: ['#2563eb', '#1e3a8a'], logo: logo('moov-money'),
    androidPackage: 'ci.moovmoney.mmpayapi', playStoreUrl: play('ci.moovmoney.mmpayapi')
  },
  { id: 'bank', name: 'Ma banque', kind: 'bank', short: 'B', verified: false, card: ['#4338ca', '#1e1b4b'] },
  { id: 'other', name: 'Autre établissement', kind: 'bank', short: '+', verified: false, card: ['#475569', '#1e293b'] }
];

/**
 * Apps avec lesquelles on peut PAYER (choix « Mon app pour payer »).
 * Les banques restent des comptes où l'on peut RECEVOIR, mais on ne paie pas « avec la banque » pour l'instant.
 */
export const PAYER_APPS: Provider[] = PROVIDERS.filter((p) => p.kind === 'wallet');
export const isPayerApp = (id: string | null | undefined) => PAYER_APPS.some((p) => p.id === id);

export function getProvider(id: string | null | undefined): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
}

export function aliasDisplayName(alias: { provider_id: string; label: string | null }): string {
  return alias.label?.trim() || getProvider(alias.provider_id).name;
}
