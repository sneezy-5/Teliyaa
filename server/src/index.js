import http from 'node:http';
import { handle } from './app.js';
import { config } from './config.js';
import { cleanup, initDb, pool } from './db.js';

await initDb();
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

// Arrêt propre (docker stop)
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
