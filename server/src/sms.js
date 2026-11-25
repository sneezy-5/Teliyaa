import { config } from './config.js';

/**
 * Envoi du code de connexion.
 * - whatsapp : par WhatsApp via l'API Poolchat (WHATSAPP_API_URL + WHATSAPP_API_KEY)
 * - http     : passerelle SMS à toi (ex. téléphone Android + app de passerelle en mode local)
 * - console  : le code est seulement écrit dans les logs du serveur (tests)
 */

const DRIVER = config.sms.driver;

export function codeMessage(code) {
  return `Teliyaa : ton code de connexion est ${code}. Il expire dans 5 minutes. Ne le partage avec personne.`;
}

export async function sendCode(phoneE164, code) {
  const text = codeMessage(code);
  switch (DRIVER) {
    case 'whatsapp':
      return sendWhatsApp(phoneE164, text);
    case 'http':
      return sendHttp(phoneE164, text);
    case 'console':
      console.log(`[code de connexion] ${phoneE164} → ${code}`);
      return;
    default:
      throw new Error(`OTP_DRIVER inconnu : ${DRIVER}`);
  }
}

/** WhatsApp (Poolchat) : numéro sans le « + » (ex. 2250707070707). */
async function sendWhatsApp(phoneE164, text) {
  const url = process.env.WHATSAPP_API_URL || 'https://api.poolchat.online/api/messages/send';
  const key = process.env.WHATSAPP_API_KEY;
  if (!key) throw new Error('WHATSAPP_API_KEY manquante (deploy.env).');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify({ recipientNumber: phoneE164.replace(/^\+/, ''), type: 'TEXT', content: text }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Envoi WhatsApp refusé (${res.status}) ${detail.slice(0, 200)}`);
  }
}

/** Passerelle SMS HTTP générique (corps JSON configurable). */
async function sendHttp(phoneE164, text) {
  const { url, user, pass, token, template } = config.sms;
  if (!url) throw new Error('SMS_HTTP_URL manquante (deploy.env).');
  const esc = (v) => JSON.stringify(v).slice(1, -1);
  const body = template.replaceAll('{{phone}}', esc(phoneE164)).replaceAll('{{text}}', esc(text));
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (user) headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Passerelle SMS : erreur ${res.status}`);
}

export const otpChannel = DRIVER === 'whatsapp' ? 'whatsapp' : 'sms';
