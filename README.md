# Teliyaa — phase 1 (PWA Vue 3 + app mobile Capacitor)

*Teliya* : la rapidité en bambara (et, tout proche, *teriya* : l'amitié). On a ajouté un « a », comme quand on allonge le mot pour dire « viiite ! ».
Teliyaa : envoyer vite de l'argent à ses proches, dans toute l'UEMOA.

Regroupe tes alias PI-SPI (Wave, Orange Money, MTN, Moov, banque) et fais-toi payer avec un seul lien ou un @pseudo.
**L'app ne touche jamais l'argent** : le transfert se fait toujours dans l'app de celui qui paie.

## Démarrer en 2 minutes (mode démo, sans serveur)

```bash
npm install
npm run dev
```

Ouvre l'adresse affichée (sur ton téléphone : même Wi-Fi, `npm run dev -- --host`).
En mode démo, tout est stocké dans le navigateur et **le code SMS est `123456`**.
Trois comptes d'exemple existent déjà : `@aminata.k`, `@moussa`, `@fatou.t` (cherche « ami » dans Envoyer).

## Ton propre serveur (dossier `server/`)

Backend maison en Node.js + **PostgreSQL**, sans framework, une seule dépendance (`pg`). Il sert l'API **et** le site.
Seul service extérieur : l'envoi du code de connexion par **WhatsApp** (Poolchat). PostgreSQL et Nginx sont ceux déjà en place sur ton serveur.

| Route | Rôle |
| --- | --- |
| `POST /api/auth/code` · `POST /api/auth/verify` · `POST /api/auth/logout` | Connexion par code WhatsApp **ou SMS** (`channel: "whatsapp" \| "sms"`, 6 chiffres, 5 min, 5 essais) |
| `GET /api/auth/channels` | Moyens proposés pour recevoir le code (`OTP_CHANNELS`) |
| `GET /api/me` · `PUT /api/me/profile` · `GET /api/usernames/:pseudo` | Mon compte, mon profil, pseudo libre ? |
| `GET/POST /api/me/aliases` · `PUT/DELETE /api/me/aliases/:id` | Mes comptes (alias) |
| `GET /api/profiles/:pseudo` | Page publique (sans compte) |
| `GET /api/search?q=` · `POST /api/contacts/match` | Recherche @pseudo, contacts du répertoire |

Sécurité : codes et jetons stockés seulement sous forme d'empreinte, numéro du profil toujours pris du compte vérifié, limites anti-abus (3 codes / 15 min par numéro, 20 / heure par IP, 10 000 contacts / jour), le public ne voit jamais le numéro de connexion.

### Mise en ligne (Docker Swarm + PostgreSQL et Nginx existants)

L'app tourne comme un service du Swarm (`teliyaa_app`) sur le réseau `whatsapp-network`. Elle parle à PostgreSQL via **PgBouncer** (`infra_pgbouncer:6432`) et ouvre le port **3100** sur la machine pour **Nginx** (installé hors Docker).

1. **Base** (une fois) : crée l'utilisateur et la base `teliyaa` avec `deploy/create-db.sql`, **directement sur PostgreSQL** (pas via PgBouncer). PostgreSQL 13 minimum. Les tables se créent seules au démarrage.
2. **PgBouncer** : il doit accepter la base `teliyaa` et l'utilisateur `teliyaa`.
   - Si sa config liste les bases une par une (`[databases]` ou variable `DATABASE_URL` de l'image edoburu), ajoute : `teliyaa = host=<hôte postgres> port=5432 dbname=teliyaa`.
   - Ajoute l'utilisateur `teliyaa` dans son fichier d'authentification (`userlist.txt`) si PgBouncer en utilise un.
   - Le mode `transaction` convient : l'app n'utilise ni requêtes préparées nommées ni réglages de session.
3. **Configuration** : sur le serveur, `cp deploy.env.example deploy.env` puis remplis `DATABASE_URL`, `APP_SECRET`, `WHATSAPP_API_KEY`.
4. **Image et service** (sur le nœud manager, celui où tourne Nginx) :
   ```bash
   docker build --build-arg PUBLIC_URL=https://teliyaa.com -t teliyaa:latest .
   docker stack deploy -c docker-compose.yml teliyaa
   docker service logs -f teliyaa_app   # « Teliyaa écoute sur le port 3000 (envoi des codes : whatsapp) »
   curl -I http://127.0.0.1:3100        # doit répondre 200
   ```
5. **Fermer le port 3100 à internet** : Docker contourne `ufw`, il faut une règle dans la chaîne `DOCKER-USER` (remplace `eth0` par ton interface publique : `ip route | grep default`) :
   ```bash
   iptables -I DOCKER-USER -i eth0 -p tcp -m conntrack --ctorigdstport 3100 -j DROP
   ```
   Pour la garder après un redémarrage : `apt install iptables-persistent` puis `netfilter-persistent save`. Même sans cette règle, l'app ne croit l'IP transmise (`X-Forwarded-For`) que si la requête vient de la machine.
6. **Nginx** : copie `deploy/nginx-teliyaa.conf` dans `/etc/nginx/sites-available/teliyaa`, active-le, `certbot --nginx -d teliyaa.com -d www.teliyaa.com`, puis `nginx -t && systemctl reload nginx`.
7. **DNS** : `teliyaa.com` et `www.teliyaa.com` vers l'IP du serveur.

Mettre à jour : refaire le `docker build` puis `docker service update --force --image teliyaa:latest teliyaa_app`.
Sauvegarder la base : `pg_dump` de la base `teliyaa` directement sur PostgreSQL (pas via PgBouncer), régulièrement, copiée ailleurs que sur le serveur.

Pour tester sans envoyer de vrais messages : `OTP_DRIVER=console`, le code s'affiche dans `docker service logs`.

> `deploy/Caddyfile` n'est plus utilisé (Nginx est déjà en place) : tu peux le supprimer.

### En local (développement)

```bash
# Une base PostgreSQL locale, par exemple :
docker run -d --name teliyaa-db -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=teliyaa -p 5432:5432 postgres:16-alpine

cd server && npm install
DATABASE_URL=postgres://postgres:dev@localhost:5432/teliyaa APP_SECRET=$(openssl rand -hex 32) OTP_DRIVER=console npm run dev
```
Puis dans un autre terminal, à la racine : `npm run dev` (Vite renvoie `/api` vers le serveur). Le code de connexion s'affiche dans le terminal du serveur.

### App mobile

Construire avec `VITE_API_URL=https://teliyaa.com` dans `.env`, puis `npm run cap:android` / `npm run cap:ios`.

`npm run build:demo` produit toujours une version 100 % statique en mode démo (liens en `/#/…`), hébergeable n'importe où.

> Les anciens fichiers Supabase (`supabase/`, `src/lib/api/supabase.ts`, paquet `@supabase/supabase-js`) ne sont plus utilisés : tu peux les supprimer (`npm uninstall @supabase/supabase-js`).

## Ce que fait la v1

| Écran | Route |
| --- | --- |
| Accueil (lien perso, QR, comptes, paiements à confirmer) | `/` |
| Connexion par numéro + code SMS | `/login` |
| Profil : nom + @pseudo unique | `/onboarding` |
| Ajouter / modifier un compte (alias) | `/aliases/new`, `/aliases/:id` |
| Demander un montant → lien unique | `/requests/new`, `/requests/:code` |
| Activité : demandes, reçus à confirmer, envoyés | `/activity` |
| Envoyer à un @pseudo ou à un contact du répertoire | `/send`, `/send/:username` |
| Réglages : visible dans la recherche, trouvable par numéro, app favorite | `/profile` |
| **Page publique** (sans compte) | `/u/:username` |
| **Demande publique** (sans compte) | `/r/:code` |

Parcours de paiement (« niveau 1 » du plan) : le payeur choisit un compte → choisit son app → l'alias est copié et l'app s'ouvre
(Android, si l'identifiant de l'app est connu) → il paie dans son app → il revient et déclare « j'ai payé » → le bénéficiaire vérifie et confirme.

### Retrouver ses contacts (comme WhatsApp)

Onglet **Mes contacts** dans Envoyer :
- **App installée (Android et iPhone, Capacitor)** : l'app demande une fois l'accès aux contacts, puis relit **tout le répertoire à chaque ouverture**.
  Chaque contact inscrit apparaît directement avec ses alias (Wave, Orange Money, banque…) : un toucher et on paie. Les autres ont un bouton « Inviter ».
  Seuls les numéros jamais vus partent au serveur ; tout le répertoire est revérifié une fois par jour.
- **Chrome Android (PWA)** : « Choisir dans mes contacts » ouvre le répertoire (API *Contact Picker*), l'utilisateur coche les contacts.
- **Navigateur sur iPhone ou ordinateur** : pas d'accès au répertoire, on tape le numéro.
- Chaque numéro est mis au format international (`+225…`), puis seule son **empreinte SHA-256** part au serveur (`find_contacts`).
  La base compare avec le numéro de connexion et les alias « téléphone » visibles des personnes qui ont coché « Me trouver par mon numéro » (activé par défaut).
- Limites : 500 numéros par requête, 10 000 par jour et par personne (sinon on pourrait tester tous les numéros d'un pays).
- La liste trouvée (avec les noms du répertoire) est gardée **sur le téléphone seulement**. Les contacts non inscrits ont un bouton « Inviter » (WhatsApp).
- Les numéros de téléphone sont peu nombreux : une empreinte ne les rend pas impossibles à retrouver pour le serveur. Elle évite surtout de stocker ou de journaliser le répertoire en clair.

Base déjà en place ? Relance `supabase/schema.sql` : les ajouts (`findable_by_phone`, `phone_hash`, `value_hash`, `contact_lookups`, `find_contacts`) sont écrits pour s'appliquer sans rien casser.

## App mobile Android + iPhone (Capacitor)

Le même code Vue devient une vraie app, avec accès à tout le répertoire.

**1. Installer** (une seule fois)
```bash
npm i @capacitor/core @capacitor-community/contacts @capacitor/android @capacitor/ios
npm i -D @capacitor/cli
npm run build
npx cap add android
npx cap add ios
```
Prends des versions de même numéro principal pour `@capacitor/*` et `@capacitor-community/contacts` (ex. toutes en 7.x) : `npm ls @capacitor/core` pour vérifier.

**2. Autorisation des contacts** (une seule fois, après `cap add`)
- **Android** : dans `android/app/src/main/AndroidManifest.xml`, avant `<application` :
  ```xml
  <uses-permission android:name="android.permission.READ_CONTACTS" />
  ```
- **iPhone** : dans `ios/App/App/Info.plist`, avant le dernier `</dict>` :
  ```xml
  <key>NSContactsUsageDescription</key>
  <string>Teliyaa compare les numéros de tes contacts pour te montrer ceux qui ont un compte et leurs alias de paiement. Ton répertoire n'est pas enregistré sur nos serveurs.</string>
  ```
  Sans cette phrase, l'app iPhone se ferme dès qu'elle demande l'accès.

**3. Lancer**
- Mets `VITE_PUBLIC_URL` dans `.env` (sinon les liens partagés pointeraient vers `https://localhost`).
- `npm run cap:android` ouvre Android Studio → bouton ▶ avec un téléphone branché.
- `npm run cap:ios` ouvre Xcode (sur Mac) → choisis ton équipe Apple dans *Signing & Capabilities* → ▶.
- Après chaque changement du code : `npm run cap:sync`.

**4. Publier dans les stores**
- Play Store : compte développeur Google (25 $ une fois). Google exige une **politique de confidentialité** et, pour les contacts, un écran qui explique l'usage avant de demander l'accès (c'est le bloc « Retrouve tous tes contacts »). Remplis la section « Sécurité des données » (contacts : collectés sous forme d'empreinte, non partagés).
- App Store : compte Apple Developer (99 $/an), un Mac avec Xcode. Même politique de confidentialité ; déclarer « Contacts » dans l'étiquette de confidentialité.

## Logos des établissements

Par défaut, chaque établissement est affiché avec une pastille d'initiales (W, OM, SIB, BNI…).
Les logos sont des marques déposées : **ne les ajouter qu'avec l'accord de l'établissement** (souvent via son kit presse ou son service partenariats).

- **Wave, Orange Money, MTN, Moov** : déposer le fichier dans `public/logos/` (ex. `public/logos/wave.svg`), puis ajouter `logo: 'logos/wave.svg'` à l'établissement dans `src/lib/providers.ts`.
- **Banques** : déposer le fichier dans `public/banks/` (ex. `public/banks/sib.svg`), puis ajouter `logo: 'banks/sib.svg'` à la banque dans `src/lib/banks.ts`.

Format conseillé : SVG ou PNG carré (au moins 128 × 128), fond transparent. Le logo s'affiche partout automatiquement (accueil, choix de l'app, page de paiement).

## Organisation du code

```
src/
  lib/
    api/types.ts      ← tout ce que les écrans peuvent demander
    api/demo.ts       ← mode démo (localStorage)
    api/supabase.ts   ← vraie base
    providers.ts      ← catalogue des établissements + identifiants d'app (À VÉRIFIER sur téléphone)
    openApp.ts        ← ouverture de Wave / Orange Money / banque
    format.ts         ← montants, téléphones UEMOA, pseudos
    contacts.ts       ← répertoire : numéros, empreintes, comparaison, synchronisation, invitation
    nativeContacts.ts ← accès au répertoire dans l'app Capacitor (autorisation + lecture)
    links.ts          ← liens publics, copier, partager
    session.ts        ← utilisateur connecté + profil (réactif)
  router.ts           ← routes + protection des pages privées
  components/PayPanel.vue  ← le cœur du parcours de paiement
  pages/              ← un composant .vue par écran
supabase/schema.sql   ← tables, règles d'accès (RLS), fonctions publiques
```

Stack : **Vue 3** (`<script setup>` + TypeScript), **Vue Router 4**, Vite, vite-plugin-pwa. La session est un simple objet réactif (`src/lib/session.ts`) : pas besoin de Pinia à ce stade.

Tests : `npm test` (formats, ouverture d'app, parcours complet en mode démo). Vérification des types : `npm run typecheck`.

## Sécurité déjà en place

- Le téléphone du profil vient du compte vérifié par SMS, jamais de ce que le client envoie.
- Chacun ne lit que ses propres données (Row Level Security). Le public ne voit que pseudo, nom et alias marqués visibles — jamais le numéro de connexion.
- La recherche @pseudo est réservée aux utilisateurs connectés, et seulement sur les profils qui l'acceptent.
- Pseudos réservés (banques, opérateurs, « support »…), 50 demandes par jour max, limite sur les déclarations anonymes.
- Rappel systématique de vérifier le nom affiché par sa propre app avant de valider.

## À faire ensuite

1. **Tests terrain** : remplir `androidPackage` / `iosScheme` dans `providers.ts` pour chaque établissement, puis passer `verified: true`.
2. **QR PI-SPI officiel** (alias + montant, format BCEAO) à la place du QR qui contient le lien.
3. **Aperçu WhatsApp** des liens (titre + montant) : petite fonction serveur (Vercel/Supabase Edge) qui renvoie les balises Open Graph pour `/u/…` et `/r/…`.
4. **Notifications push** quand quelqu'un déclare un paiement.
5. **App mobile** : faite (voir « App mobile Android + iPhone »). Reste à ajouter les « App Links » (Android) et « Universal Links » (iPhone)
   pour que `tonapp.link/r/…` ouvre l'app installée.
