<script setup lang="ts">
import PublicShell from '../components/PublicShell.vue';

/**
 * Politique de confidentialité (exigée par le Play Store et l'App Store).
 * Adresse publique : https://teliyaa.com/confidentialite
 * À faire relire si possible avant publication.
 */
const UPDATED = '25 novembre 2026';
const CONTACT = 'contact@teliyaa.com';
const PUBLISHER = 'Teliyaa';
</script>

<template>
  <PublicShell>
    <article class="stack legal">
      <h1>Politique de confidentialité</h1>
      <p class="muted small">Dernière mise à jour : {{ UPDATED }}</p>

      <p>
        Teliyaa est un annuaire qui regroupe les alias de paiement PI-SPI (Wave, Orange Money, MTN MoMo, Moov Money, banques) et
        permet d'envoyer de l'argent à ses contacts depuis sa propre application de paiement. <strong>Teliyaa ne détient, ne reçoit et ne
        transfère jamais d'argent</strong> : chaque paiement se fait dans l'application de paiement de l'utilisateur.
      </p>
      <p>Éditeur et responsable du traitement : {{ PUBLISHER }}. Contact : <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>.</p>

      <h2>1. Données que nous collectons</h2>
      <ul>
        <li><strong>Numéro de téléphone</strong> : pour créer ton compte et te connecter (code de vérification).</li>
        <li><strong>Nom et @pseudo</strong> : affichés sur ta page de paiement et à ceux qui te cherchent.</li>
        <li>
          <strong>Tes comptes (alias PI-SPI)</strong> : établissement, alias (souvent un numéro de téléphone ou une adresse de paiement),
          nom affiché. Ceux que tu marques « visibles » sont publics sur ta page de paiement.
        </li>
        <li><strong>Tes réglages</strong> : app de paiement préférée, être trouvable par @pseudo ou par numéro.</li>
        <li><strong>Données techniques</strong> : adresse IP et dates de connexion, utilisées uniquement contre les abus et conservées 2 jours au plus.</li>
      </ul>

      <h2>2. Tes contacts</h2>
      <p>Si tu l'autorises, l'application lit le <strong>nom et les numéros</strong> des contacts de ton téléphone pour te montrer ceux qui utilisent Teliyaa.</p>
      <ul>
        <li><strong>Les noms de tes contacts ne quittent jamais ton téléphone.</strong></li>
        <li>
          Pour chaque numéro, seule une <strong>empreinte</strong> (calcul SHA-256 du numéro) est envoyée à notre serveur, qui la compare
          aux comptes Teliyaa existants. Ces empreintes <strong>ne sont pas enregistrées</strong> : seul le nombre de numéros comparés est
          conservé 2 jours au plus, pour empêcher les abus.
        </li>
        <li>La liste de tes contacts trouvés est gardée uniquement sur ton téléphone.</li>
        <li>Tu peux refuser ou retirer cet accès à tout moment dans les réglages de ton téléphone. L'application reste utilisable (recherche par @pseudo ou par numéro).</li>
      </ul>

      <h2>3. Ce que voient les autres</h2>
      <ul>
        <li>Ta page de paiement publique montre ton nom, ton @pseudo et tes comptes visibles. <strong>Ton numéro de connexion n'est jamais affiché</strong> (sauf si tu l'as toi-même ajouté comme alias visible).</li>
        <li>Les personnes qui ont ton numéro dans leurs contacts peuvent te trouver, sauf si tu désactives « Me trouver par mon numéro ».</li>
        <li>La recherche par @pseudo est réservée aux utilisateurs connectés, et tu peux t'en retirer (« Me trouver par mon @pseudo »).</li>
      </ul>

      <h2>4. Avec qui nous partageons</h2>
      <ul>
        <li><strong>Envoi du code de connexion</strong> : ton numéro et le code sont transmis à notre prestataire d'envoi de messages WhatsApp, uniquement pour te l'envoyer.</li>
        <li><strong>Applications de paiement</strong> : quand tu envoies de l'argent, Teliyaa copie l'alias du destinataire et ouvre ton application. Aucune donnée n'est envoyée par Teliyaa à ces établissements.</li>
        <li>Nous ne vendons pas tes données et ne les utilisons pas pour de la publicité.</li>
      </ul>

      <h2>5. Où et combien de temps</h2>
      <ul>
        <li>Les données sont stockées sur nos propres serveurs. Les échanges avec l'application sont chiffrés (https).</li>
        <li>
          Ton <strong>code PIN</strong> n'est jamais enregistré en clair : nos serveurs n'en gardent qu'une empreinte chiffrée, pour le vérifier.
          Si tu actives l'empreinte digitale ou le visage, la vérification se fait uniquement par ton téléphone : nous ne recevons jamais ces données.
        </li>
        <li>Tes données sont conservées tant que ton compte existe. Codes de connexion : 5 minutes. Sessions : 180 jours au plus.</li>
      </ul>

      <h2>6. Supprimer ton compte</h2>
      <p>
        Dans l'application : <strong>Profil → Supprimer mon compte</strong>. Ton compte, ton profil, tes comptes (alias) et tes sessions sont
        supprimés immédiatement et définitivement. Tu peux aussi demander la suppression par e-mail à <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>, depuis ou en indiquant le numéro du compte.
      </p>

      <h2>7. Tes droits</h2>
      <p>
        Tu peux accéder à tes données, les corriger (dans l'application) ou les faire supprimer. Pour toute question : <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>. Tu peux
        aussi saisir l'autorité de protection des données personnelles de ton pays.
      </p>

      <h2>8. Enfants</h2>
      <p>Teliyaa n'est pas destiné aux personnes de moins de 18 ans.</p>

      <h2>9. Modifications</h2>
      <p>En cas de changement important, nous te prévenons dans l'application. La date de mise à jour figure en haut de cette page.</p>
    </article>
  </PublicShell>
</template>
