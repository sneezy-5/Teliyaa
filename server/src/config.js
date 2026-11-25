/**
 * Configuration du serveur, lue dans les variables d'environnement (voir deploy.env.example).
 */
const env = process.env;

function required(name) {
  const value = env[name];
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name} (voir deploy.env.example)`);
    process.exit(1);
  }
  return value;
}

const list = (value) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  production: env.NODE_ENV === 'production',
  port: Number(env.PORT || 3003),
  databaseUrl: required('DATABASE_URL'),
  /** Secret pour signer les codes SMS (au moins 32 caractères aléatoires) */
  secret: required('APP_SECRET'),
  /** Dossier du site construit (dist/). Vide = API seule. */
  staticDir: env.STATIC_DIR || '',
  /** Derrière Nginx : lire l'IP du client dans X-Forwarded-For */
  trustProxy: env.TRUST_PROXY === '1',
  /** Numéros (E.164) qui ont accès au back-office, séparés par des virgules. Vide = personne. */
  adminPhones: list(env.ADMIN_PHONES),
  /** Origines autorisées à appeler l'API depuis une autre adresse (app mobile Capacitor, dev) */
  corsOrigins: list(env.CORS_ORIGINS || 'capacitor://localhost,https://localhost,http://localhost,http://localhost:5173'),
  sms: {
    /**
     * Envoi du code de connexion :
     * whatsapp (Poolchat) · http (passerelle SMS à toi) · console (code dans les logs, pour tester)
     */
    driver: env.OTP_DRIVER || 'console',
    url: env.SMS_HTTP_URL || '',
    user: env.SMS_HTTP_USER || '',
    pass: env.SMS_HTTP_PASS || '',
    token: env.SMS_HTTP_TOKEN || '',
    /** Corps JSON envoyé à la passerelle ; {{phone}} et {{text}} sont remplacés. */
    template: env.SMS_HTTP_TEMPLATE || '{"textMessage":{"text":"{{text}}"},"phoneNumbers":["{{phone}}"]}'
  }
};

if (config.secret.length < 32) {
  console.error('APP_SECRET doit faire au moins 32 caractères (ex. : openssl rand -hex 32).');
  process.exit(1);
}
if (config.production && config.sms.driver === 'console') {
  console.warn('⚠️  OTP_DRIVER=console en production : les codes ne sont pas envoyés, ils sont seulement écrits dans les logs.');
}
if (config.sms.driver === 'whatsapp' && !env.WHATSAPP_API_KEY) {
  console.error('OTP_DRIVER=whatsapp mais WHATSAPP_API_KEY est vide (deploy.env).');
  process.exit(1);
}
