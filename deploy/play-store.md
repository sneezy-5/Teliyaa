# Teliyaa — préparation Play Store

Tout ce qu'il faut copier dans la Play Console. Les parties entre [crochets] sont à compléter.

---

## 1. Fiche de l'application

**Nom de l'application** (30 caractères max)
> Teliyaa

**Description courte** (80 caractères max)
> Envoie de l'argent à tes contacts en un toucher, avec Wave, Orange Money…

**Description complète** (4 000 caractères max)
> Teliyaa, c'est l'annuaire de paiement de tes proches.
>
> Ouvre Teliyaa : tes contacts qui l'utilisent apparaissent avec leurs comptes Wave, Orange Money, MTN MoMo, Moov Money ou bancaires. Touche un contact : son alias est copié et ton application de paiement s'ouvre directement. Plus besoin de demander « c'est quoi ton numéro Wave ? ».
>
> ✔ Tes contacts retrouvés automatiquement, comme sur WhatsApp
> ✔ Un toucher pour ouvrir ton app de paiement avec le bon alias
> ✔ Tous tes comptes PI-SPI regroupés au même endroit
> ✔ Ta page et ton QR code pour te faire payer
> ✔ Fonctionne dans toute la zone UEMOA
>
> Teliyaa ne touche jamais à ton argent : chaque paiement se fait dans ton application habituelle (Wave, Orange Money, ta banque…), grâce au système de paiement instantané PI-SPI.
>
> Ta vie privée d'abord : les noms de tes contacts ne quittent jamais ton téléphone. Seule une empreinte chiffrée des numéros sert à trouver ceux qui utilisent Teliyaa.
>
> Teliyaa — « la rapidité » en bambara.
>
> Teliyaa est une application indépendante, sans lien avec Wave, Orange, MTN, Moov, la BCEAO ou les banques citées.

**Catégorie** : Finance
**Adresse de la politique de confidentialité** : https://teliyaa.com/confidentialite
**E-mail de contact** : [E-MAIL DE CONTACT]

**Éléments graphiques à fournir**
- Icône : 512 × 512 px, PNG
- Image de présentation : 1024 × 500 px
- Au moins 2 captures d'écran de téléphone (conseillé : Accueil avec QR, Mes contacts, Ajouter un compte, Payer avec Wave)

---

## 2. Déclaration d'accès aux contacts (permission sensible)

Google demande de justifier `READ_CONTACTS` :

**Fonctionnalité principale qui utilise les contacts**
> Teliyaa compare les numéros des contacts de l'utilisateur avec les comptes Teliyaa existants pour afficher ceux à qui il peut envoyer de l'argent, avec leurs alias de paiement. C'est la fonction principale de l'application (annuaire de paiement).

**Écran d'information avant la demande** : oui — écran « Retrouve tous tes contacts » expliquant l'usage, avec le bouton « Autoriser l'accès à mes contacts », affiché avant la fenêtre système.

Préparer une courte vidéo (30 s) : ouvrir Envoyer → Mes contacts → écran d'explication → autorisation → liste des contacts trouvés → toucher un contact → l'app de paiement s'ouvre.

---

## 3. Formulaire « Sécurité des données »

**L'application collecte-t-elle ou partage-t-elle des données ?** Oui
**Les données sont-elles chiffrées en transit ?** Oui (https)
**L'utilisateur peut-il demander la suppression de ses données ?** Oui — dans l'app (Profil → Supprimer mon compte) et par e-mail.

| Type de données | Collectée | Partagée | Obligatoire | Pourquoi |
| --- | --- | --- | --- | --- |
| **Informations personnelles → Nom** | Oui | Non | Oui | Fonctionnalité de l'app (profil affiché) |
| **Informations personnelles → Numéro de téléphone** | Oui | Oui* | Oui | Gestion du compte (connexion), fonctionnalité de l'app |
| **Informations personnelles → Autres infos (pseudo, alias de paiement)** | Oui | Non | Oui | Fonctionnalité de l'app |
| **Contacts** | Oui** | Non | Non (facultatif) | Fonctionnalité de l'app (trouver ses contacts) |
| **Identifiants de l'appareil ou autres → adresse IP** | Oui | Non | Oui | Prévention des fraudes, sécurité |

\* Partagé avec le prestataire d'envoi du code de connexion (WhatsApp) uniquement pour envoyer ce code. Vérifie dans les règles Google si un prestataire agissant pour ton compte compte comme « partage » : en général non (« fournisseur de services »).

\*\* Traité de façon éphémère : seules des empreintes des numéros sont envoyées et elles ne sont pas stockées. Google demande quand même de déclarer « Contacts » comme collectés ; coche **« Données traitées de façon éphémère »**.

**Non collecté** : position, photos, messages, données financières (Teliyaa ne voit aucun paiement), données de santé, identifiants publicitaires.

---

## 4. Autres questions de la Play Console

- **Application financière** : Teliyaa n'est ni une banque, ni un service de paiement, ni un prêt : c'est un annuaire qui ouvre l'application de paiement de l'utilisateur. Selon les pays, Google peut demander des précisions : répondre « autre » et l'expliquer comme ci-dessus.
- **Public cible** : 18 ans et plus.
- **Publicités** : non.
- **Accès à l'application** pour les testeurs de Google : fournir un numéro de test et la façon d'obtenir le code (par exemple un compte de test dédié — à prévoir côté serveur si besoin).

---

## 5. Publication

1. Domaine + https en place, puis :
   `VITE_API_URL=https://teliyaa.com VITE_PUBLIC_URL=https://teliyaa.com npm run cap:android`
2. Android Studio → **Build → Generate Signed App Bundle** → créer la **clé de signature** (fichier `.jks` + mots de passe).
   **À sauvegarder à deux endroits sûrs** : sans elle, plus aucune mise à jour possible (sauf si tu actives la signature par Google Play, recommandé).
3. Play Console → **Test interne** → importer le fichier `.aab` → inviter les testeurs.
4. Après les retours : **Production**.

À chaque nouvelle version : augmenter `versionCode` (et `versionName`) dans `android/app/build.gradle`.
