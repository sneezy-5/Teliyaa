import http from 'node:http';
import { handle } from './app.js';
import { detectSuspects } from './audit.js';
import { config } from './config.js';
import { cleanup, initDb, pool } from './db.js';

try {
  await initDb();
} catch (e) {
  // Message clair au lieu d'une longue trace (le service redémarre tout seul)
  const host = (() => {
    try {
      const u = new URL(config.databaseUrl);
      return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
    } catch {
      return 'DATABASE_URL illisible';
    }
  })();
  const hints = {
    '28P01': 'mot de passe refusé',
    '08P01': 'identifiants refusés (mot de passe, ou utilisateur absent de userlist.txt de PgBouncer)',
    '3D000': "la base n'existe pas",
    ECONNREFUSED: 'serveur injoignable',
    ENOTFOUND: 'nom du serveur introuvable (réseau Docker ?)'
  };
  console.error(`Connexion à la base impossible (${host}) : ${hints[e.code] ?? e.message}`);
  console.error('Vérifie DATABASE_URL dans deploy.env (caractères spéciaux du mot de passe encodés, ex. @ → %40), puis redéploie.');
  process.exit(1);
}
console.log('Base de données prête.');

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.listen(config.port, () => {
  console.log(`Teliyaa écoute sur le port ${config.port} (envoi des codes : ${config.sms.driver})`);
});

// Ménage toutes les heures
setInterval(() => cleanup().catch((e) => console.error('Ménage :', e.message)), 60 * 60 * 1000).unref();
// Détection des comportements suspects toutes les 10 minutes
setInterval(() => detectSuspects().catch((e) => console.error('Détection :', e.message)), 10 * 60 * 1000).unref();

// Arrêt propre (docker stop)
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
