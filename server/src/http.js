/** Petits outils HTTP, sans framework. */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Lit un corps JSON (limité en taille). */
export function readJson(req, limitBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, status, data, headers = {}) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

/** Limiteur en mémoire (suffisant pour un seul serveur). */
export function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return function check(key, message = 'Trop de tentatives. Réessaie dans quelques minutes.') {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return;
    }
    entry.count++;
    if (entry.count > max) throw new HttpError(429, message);
  };
}
