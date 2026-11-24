/**
 * Banques de Côte d'Ivoire proposées quand on ajoute un compte « Banque ».
 * Le nom choisi est enregistré dans le libellé de l'alias (affiché à la place de « Ma banque »).
 *
 * À VÉRIFIER : liste établie de mémoire, à comparer avec la liste officielle des participants
 * PI-SPI publiée par la BCEAO (fusions et changements de nom possibles). « Autre banque » permet
 * toujours d'écrire un nom absent de la liste.
 *
 * Logos : les logos sont des marques déposées. Ne les ajouter qu'avec l'accord de la banque.
 * Pour en ajouter un : déposer le fichier dans `public/banks/` (ex. `public/banks/sib.svg`)
 * et renseigner `logo: 'banks/sib.svg'` ci-dessous. Sans logo, on affiche les initiales.
 */
export interface Bank {
  name: string;
  /** Initiales affichées dans la pastille (3 lettres max) */
  short: string;
  /** Chemin d'un logo autorisé, relatif à `public/` */
  logo?: string;
}

export const BANKS_CI: readonly Bank[] = [
  { name: 'Access Bank', short: 'AB' },
  { name: 'Afriland First Bank', short: 'AFB' },
  { name: 'Banque Atlantique (BACI)', short: 'BA' },
  { name: "Banque d'Abidjan (BDA)", short: 'BDA' },
  { name: "Banque de l'Habitat (BHCI)", short: 'BH' },
  { name: 'Banque Populaire (BPCI)', short: 'BP' },
  { name: 'BICICI', short: 'BIC' },
  { name: 'BNI', short: 'BNI' },
  { name: 'Bank of Africa (BOA)', short: 'BOA' },
  { name: 'Bridge Bank', short: 'BB' },
  { name: 'Citibank', short: 'CB' },
  { name: 'Coris Bank', short: 'CO' },
  { name: 'Ecobank', short: 'EB' },
  { name: 'GTBank', short: 'GT' },
  { name: 'Mansa Bank', short: 'MB' },
  { name: 'NSIA Banque', short: 'NS' },
  { name: 'Orabank', short: 'OB' },
  { name: 'SIB', short: 'SIB' },
  { name: 'Société Générale', short: 'SG' },
  { name: 'Stanbic Bank', short: 'SB' },
  { name: 'Standard Chartered', short: 'SC' },
  { name: 'UBA', short: 'UBA' },
  { name: 'Versus Bank', short: 'VB' }
];

export const findBank = (name: string | null | undefined): Bank | undefined => (name ? BANKS_CI.find((b) => b.name === name) : undefined);

/** Le libellé `label` correspond-il à une banque de la liste ? */
export const isKnownBank = (label: string | null | undefined) => !!findBank(label);

/** Initiales d'une banque hors liste (« Baobab » → « BA »). */
export function bankInitials(name: string): string {
  const words = name.replace(/[()']/g, ' ').trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '?').slice(0, 2);
  return letters.slice(0, 3).toUpperCase();
}

/**
 * Couleur de pastille stable pour chaque banque (même nom → même couleur).
 * Palette neutre de tonapp : on n'imite pas les couleurs des marques.
 */
const PALETTE = [
  ['#e0e7ff', '#3730a3'],
  ['#dcfce7', '#166534'],
  ['#fef3c7', '#92400e'],
  ['#fce7f3', '#9d174d'],
  ['#e0f2fe', '#075985'],
  ['#ede9fe', '#5b21b6'],
  ['#ffedd5', '#9a3412'],
  ['#ccfbf1', '#115e59']
] as const;

export function bankColors(name: string): { background: string; color: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [background, color] = PALETTE[h % PALETTE.length];
  return { background, color };
}
