import type { ShareDuration } from './types';

/** Durées proposées pour un accès (personne ajoutée ou lien secret) */
export const DURATIONS: { id: ShareDuration; label: string }[] = [
  { id: '1h', label: '1 h' },
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: 'forever', label: 'Toujours' }
];

/** « toujours », « encore 35 min », « encore 5 h », « jusqu'au 12 déc. » */
export function formatUntil(iso: string | null, now = Date.now()): string {
  if (!iso) return 'toujours';
  const left = new Date(iso).getTime() - now;
  if (left <= 0) return 'expiré';
  const min = Math.ceil(left / 60_000);
  if (min < 60) return `encore ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `encore ${hours} h`;
  const date = new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `jusqu'au ${date}`;
}
