const useHash = import.meta.env.VITE_ROUTER === 'hash' || import.meta.env.MODE === 'demo';

function base(): string {
  const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, '');
  if (configured) return useHash ? `${configured}/#` : configured;
  const { origin, pathname } = window.location;
  if (useHash) return `${origin}${pathname.replace(/index\.html$/, '')}#`;
  return origin;
}

export const profileLink = (username: string) => `${base()}/u/${username}`;
export const requestLink = (code: string) => `${base()}/r/${code}`;

/** Lien affiché (sans https://) */
export const prettyLink = (url: string) => url.replace(/^https?:\/\//, '');

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour les navigateurs sans API presse-papiers
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}

/** Message WhatsApp prêt à envoyer (l'utilisateur choisit le destinataire). */
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/**
 * SMS prêt à envoyer. iPhone et Android n'écrivent pas le texte de la même façon :
 * `sms:&body=` sur iPhone, `sms:?body=` sur Android.
 */
export function smsLink(text: string, userAgent = navigator.userAgent): string {
  const sep = /iPhone|iPad|iPod/i.test(userAgent) ? '&' : '?';
  return `sms:${sep}body=${encodeURIComponent(text)}`;
}

/** Vrai si le téléphone propose son menu de partage (toutes les apps). */
export const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Partage natif du téléphone, sinon WhatsApp. */
export async function shareText(text: string, url: string): Promise<'shared' | 'whatsapp'> {
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
  return 'whatsapp';
}
