import QRCode from 'qrcode';
import { formatAmount } from './format';
import { prettyLink } from './links';
import { PAYER_APPS } from './providers';

/**
 * Affiche de comptoir (mode commerçant) dessinée en image PNG :
 * à imprimer, à mettre en statut WhatsApp ou à envoyer aux clients.
 * Format portrait 1080 × 1560 (lisible sur téléphone, imprimable en A4).
 */
export interface PosterInput {
  name: string;
  link: string;
  amount: number | null;
  note: string;
}

const W = 1080;
const H = 1560;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const INK = '#111827';
const MUTED = '#6b7280';
const ACCENT = '#4338ca';

/** Apps proposées au client sur l'affiche : toutes, car PI-SPI relie les opérateurs entre eux */
export const POSTER_APPS = [
  ...PAYER_APPS.map((p) => ({ label: p.name, c1: p.card[0], c2: p.card[1], ink: p.cardInk ?? '#ffffff' })),
  { label: 'Banques', c1: '#4338ca', c2: '#1e1b4b', ink: '#ffffff' }
];

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Texte centré ; la police rétrécit s'il est trop large */
function centered(g: CanvasRenderingContext2D, text: string, y: number, size: number, weight: number, color: string, maxWidth = 880) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxWidth && s > 18) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.fillText(text, W / 2, y);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Pastilles des apps, centrées, sur une ou plusieurs lignes. Renvoie le bas du bloc. */
function chips(g: CanvasRenderingContext2D, top: number): number {
  const h = 64;
  const gap = 16;
  g.font = `700 30px ${FONT}`;
  const widths = POSTER_APPS.map((a) => g.measureText(a.label).width + 56);
  const rows: number[][] = [];
  let row: number[] = [];
  let width = 0;
  widths.forEach((w, i) => {
    if (row.length && width + gap + w > 900) {
      rows.push(row);
      row = [];
      width = 0;
    }
    width += (row.length ? gap : 0) + w;
    row.push(i);
  });
  if (row.length) rows.push(row);

  let y = top;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of rows) {
    const total = r.reduce((s, i) => s + widths[i], 0) + gap * (r.length - 1);
    let x = (W - total) / 2;
    for (const i of r) {
      const a = POSTER_APPS[i];
      const grd = g.createLinearGradient(x, y, x + widths[i], y + h);
      grd.addColorStop(0, a.c1);
      grd.addColorStop(1, a.c2);
      roundRect(g, x, y, widths[i], h, h / 2);
      g.fillStyle = grd;
      g.fill();
      g.fillStyle = a.ink;
      g.fillText(a.label, x + widths[i] / 2, y + h / 2 + 1);
      x += widths[i] + gap;
    }
    y += h + gap;
  }
  g.textBaseline = 'alphabetic';
  return y - gap;
}

/** Dessine l'affiche et renvoie une image PNG (data URL) */
export async function posterPng(p: PosterInput): Promise<string> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('Image impossible sur ce téléphone.');

  // Fond indigo et carte blanche
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, ACCENT);
  bg.addColorStop(1, '#6d28d9');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  roundRect(g, 60, 60, W - 120, H - 160, 56);
  g.fillStyle = '#ffffff';
  g.fill();

  // Marque : icône + « Teliyaa »
  const [logo, qr] = await Promise.all([
    loadImage(`${import.meta.env.BASE_URL}icone-512.png`),
    QRCode.toDataURL(p.link, { margin: 1, width: 600, color: { dark: INK, light: '#FFFFFF' } }).then(loadImage)
  ]);
  g.font = `800 44px ${FONT}`;
  const brandW = g.measureText('Teliyaa').width;
  const logoSize = logo ? 56 : 0;
  const bx = (W - (logoSize + (logo ? 14 : 0) + brandW)) / 2;
  if (logo) {
    g.save();
    roundRect(g, bx, 112, logoSize, logoSize, 14);
    g.clip();
    g.drawImage(logo, bx, 112, logoSize, logoSize);
    g.restore();
  }
  g.fillStyle = ACCENT;
  g.textAlign = 'left';
  g.fillText('Teliyaa', bx + logoSize + (logo ? 14 : 0), 156);

  centered(g, p.name || 'Mon commerce', 270, 76, 800, INK);
  centered(g, 'Scanne pour me payer', 335, 38, 600, MUTED);

  if (qr) g.drawImage(qr, 240, 380, 600, 600);

  let next: number;
  if (p.amount) {
    centered(g, formatAmount(p.amount), 1070, 80, 800, INK);
    if (p.note) centered(g, p.note, 1125, 36, 500, MUTED);
    next = p.note ? 1165 : 1110;
  } else {
    centered(g, "Paie avec l'app de ton choix", 1065, 40, 700, ACCENT);
    next = 1110;
  }
  chips(g, next);

  centered(g, prettyLink(p.link), 1360, 30, 600, ACCENT);
  centered(g, "L'argent arrive directement sur mon compte", 1462, 30, 600, '#ffffff');
  centered(g, 'Pas besoin de compte Teliyaa pour payer', 1505, 26, 500, 'rgba(255,255,255,0.85)');

  return c.toDataURL('image/png');
}

/** Partage l'image (WhatsApp, statut…) quand le téléphone le permet, sinon la télécharge. */
export async function shareOrSavePng(dataUrl: string, fileName: string, text: string): Promise<'shared' | 'saved'> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'shared';
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'saved';
}
