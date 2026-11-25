import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { touchSession } from './audit.js';
import { userFromRequest } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError, readJson, sendJson } from './http.js';
import { routes } from './routes.js';
import { normalizeUsername } from './validate.js';

/**
 * Point d'entrée de chaque requête :
 * - /api/…  → routes de l'API (JSON)
 * - le reste → fichiers du site (dist/), et index.html pour les pages de l'app (/u/pseudo, /send…)
 */

const compiled = routes.map((r) => {
  const keys = [];
  const pattern = r.path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'));
  return { ...r, keys, re: new RegExp(`^${pattern}$`) };
});

/** Adresse privée ou locale : la requête vient de la machine (Nginx), pas d'internet. */
function isPrivate(ip) {
  const v4 = ip.replace(/^::ffff:/, '');
  return (
    v4 === '::1' ||
    /^127\./.test(v4) ||
    /^10\./.test(v4) ||
    /^192\.168\./.test(v4) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v4)
  );
}

function clientIp(req) {
  const remote = req.socket.remoteAddress ?? 'inconnue';
  // On ne croit X-Forwarded-For que s'il vient de Nginx (adresse locale) :
  // quelqu'un qui appellerait le port de l'app directement ne peut pas mentir sur son IP.
  if (config.trustProxy && isPrivate(remote)) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return remote;
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !config.corsOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY'
};

export async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const cors = corsHeaders(req);

  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    try {
      const route = compiled.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route) throw new HttpError(404, 'Introuvable.');
      const match = url.pathname.match(route.re);
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      const user = await userFromRequest(req);
      if (route.auth && !user) throw new HttpError(401, 'Connecte-toi pour continuer.');
      // Le code WhatsApp seul ne suffit pas : il faut aussi le PIN pour voir ou modifier les données
      if (route.auth && route.pin !== false && !user.pin_ok) throw new HttpError(403, 'Entre ton code PIN pour continuer.');
      // Back-office : réservé aux numéros de ADMIN_PHONES. Pour les autres, ces adresses « n'existent pas ».
      if (route.admin && !user?.is_admin) throw new HttpError(404, 'Introuvable.');
      const body = ['POST', 'PUT'].includes(req.method) ? await readJson(req) : {};
      const ctx = {
        params,
        query: url.searchParams,
        body: body ?? {},
        user,
        ip: clientIp(req),
        ua: String(req.headers['user-agent'] ?? '').slice(0, 300)
      };
      if (user) void touchSession(ctx); // dernière visite, appareil, IP (sans faire attendre)
      const data = await route.handler(ctx);
      return sendJson(res, 200, data ?? { ok: true }, { ...cors, ...SECURITY_HEADERS });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof URIError ? 400 : 500;
      if (status === 500) console.error(`${req.method} ${url.pathname}`, e);
      const message = e instanceof HttpError ? e.message : status === 400 ? 'Adresse invalide.' : 'Une erreur est survenue. Réessaie.';
      return sendJson(res, status, { error: message }, { ...cors, ...SECURITY_HEADERS });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  return serveStatic(req, res, url.pathname);
}

// ---------- Site (fichiers construits par `vite build`) ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webp': 'image/webp',
  '.jpeg': 'image/jpeg'
};

async function serveStatic(req, res, pathname) {
  if (!config.staticDir) return sendJson(res, 404, { error: 'Introuvable.' });
  const root = path.resolve(config.staticDir);

  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: 'Adresse invalide.' });
  }
  let file = path.resolve(root, `.${rel}`);
  // Interdit de sortir du dossier du site (../../etc/passwd)
  if (file !== root && !file.startsWith(root + path.sep)) return sendJson(res, 404, { error: 'Introuvable.' });

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = path.join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info) {
    // Fichier avec extension absent → 404 ; sinon c'est une page de l'app → index.html
    if (path.extname(rel)) return sendJson(res, 404, { error: 'Introuvable.' });
    file = path.join(root, 'index.html');
    info = await stat(file).catch(() => null);
    if (!info) return sendJson(res, 404, { error: 'Site non construit.' });
    // Profil public : aperçu du lien dans WhatsApp, Facebook… (nom de la personne)
    const profileMatch = rel.match(/^\/u\/([^/]+)\/?$/);
    if (profileMatch) return serveProfilePage(req, res, file, profileMatch[1]);
    // Lien secret : jamais dans Google, et aucun nom dans l'aperçu
    if (/^\/p\//.test(rel)) return serveProfilePage(req, res, file, null);
  }

  const ext = path.extname(file);
  const immutable = rel.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * index.html avec un titre et des balises Open Graph propres à la personne :
 * WhatsApp affiche alors « Payer Mariam Sanogo » sous le lien partagé.
 * On n'y met que le nom public, jamais de numéro.
 */
async function serveProfilePage(req, res, indexFile, rawUsername) {
  let html = await readFile(indexFile, 'utf8');
  let name = null;
  if (rawUsername) try {
    const username = normalizeUsername(rawUsername); // déjà décodé par serveStatic
    const { rows } = await pool.query(
      // Profil privé : pas de nom dans l'aperçu du lien
      `select p.full_name from profiles p join users u on u.id = p.id
        where p.username = $1 and u.blocked_at is null and p.visibility = 'public'`,
      [username]
    );
    name = rows[0]?.full_name ?? null;
  } catch {
    /* base indisponible : page normale, sans aperçu personnalisé */
  }

  if (name) {
    const proto = config.trustProxy ? String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0] : 'http';
    const origin = `${proto}://${req.headers.host}`;
    const title = escapeHtml(`Payer ${name} — Teliyaa`);
    const description = escapeHtml(`Wave, Orange Money, MTN, Moov ou banque : envoie de l'argent à ${name} en un geste, sans créer de compte.`);
    const tags = [
      `<meta property="og:type" content="profile" />`,
      `<meta property="og:site_name" content="Teliyaa" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${description}" />`,
      `<meta property="og:url" content="${escapeHtml(origin + req.url)}" />`,
      `<meta property="og:image" content="${escapeHtml(origin)}/icone-512.png" />`,
      `<meta name="twitter:card" content="summary" />`
    ].join('\n    ');
    html = html
      // On retire les balises de la vitrine avant de mettre celles de la personne
      .replace(/\s*<meta (property="og:[^"]*"|name="twitter:card")[^>]*>/g, '')
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}" />`)
      .replace('</head>', `    ${tags}\n  </head>`);
  }
  // Les profils se partagent par lien, mais n'apparaissent pas dans Google (vie privée)
  html = html.replace('</head>', `    <meta name="robots" content="noindex" />\n  </head>`);

  const body = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': TYPES['.html'],
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    ...SECURITY_HEADERS
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}
