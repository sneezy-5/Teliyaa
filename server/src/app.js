import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { userFromRequest } from './auth.js';
import { config } from './config.js';
import { HttpError, readJson, sendJson } from './http.js';
import { routes } from './routes.js';

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
      const body = ['POST', 'PUT'].includes(req.method) ? await readJson(req) : {};
      const data = await route.handler({ params, query: url.searchParams, body: body ?? {}, user, ip: clientIp(req) });
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
  '.txt': 'text/plain; charset=utf-8'
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
