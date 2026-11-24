import { demoApi } from './demo';
import { createServerApi } from './server';
import type { Api } from './types';

/**
 * Backend utilisé : TON serveur (dossier server/), toujours.
 * VITE_API_URL = son adresse (vide = même adresse que le site ; obligatoire pour l'app mobile,
 * ex. https://teliyaa.com).
 * Le mode démo (tout dans le navigateur, code 123456) n'existe que si on le demande exprès :
 * VITE_FORCE_DEMO=1 (npm run build:demo).
 */
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const forceDemo = import.meta.env.VITE_FORCE_DEMO === '1';

export const api: Api = forceDemo ? demoApi : createServerApi(apiUrl);

export type { Api } from './types';
