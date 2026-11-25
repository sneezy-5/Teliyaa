<script setup lang="ts">
import PublicShell from '../components/PublicShell.vue';

/**
 * Conditions d'utilisation (à présenter avec la politique de confidentialité).
 * Adresse publique : https://teliyaa.com/conditions
 * À faire relire par un juriste avant le lancement officiel si possible.
 */
const UPDATED = '25 novembre 2026';
const CONTACT = 'contact@teliyaa.com';
</script>

<template>
  <PublicShell>
    <article class="stack legal">
      <h1>Conditions d'utilisation</h1>
      <p class="muted small">Dernière mise à jour : {{ UPDATED }}</p>

      <p>
        Ces conditions encadrent l'utilisation de Teliyaa (le site teliyaa.com et les applications mobiles). En créant un compte ou en
        utilisant Teliyaa, tu les acceptes. Si tu n'es pas d'accord, n'utilise pas le service.
      </p>

      <h2>1. Ce que fait Teliyaa</h2>
      <ul>
        <li>Teliyaa est un <strong>annuaire</strong> : chacun y regroupe ses alias de paiement PI-SPI (Wave, Orange Money, MTN MoMo, Moov Money, banques) et peut retrouver ceux de ses contacts.</li>
        <li>
          Pour payer, Teliyaa copie l'alias du destinataire et ouvre <strong>ton</strong> application de paiement. Le montant, la
          validation et le transfert se font entièrement dans cette application.
        </li>
        <li>
          <strong>Teliyaa ne détient, ne reçoit et ne transfère jamais d'argent.</strong> Ce n'est ni une banque, ni un établissement de
          paiement, ni un émetteur de monnaie électronique.
        </li>
        <li>
          Teliyaa est un service indépendant. Il n'est ni édité, ni approuvé par la BCEAO, ni par les banques et opérateurs cités. Leurs noms
          et logos appartiennent à leurs propriétaires et servent seulement à indiquer à quel établissement correspond un compte.
        </li>
      </ul>

      <h2>2. Ton compte</h2>
      <ul>
        <li>Teliyaa est réservé aux personnes de <strong>18 ans et plus</strong>.</li>
        <li>Un compte correspond à un numéro de téléphone, confirmé par un code envoyé par WhatsApp. Tu dois utiliser un numéro qui t'appartient.</li>
        <li>
          Tu choisis un <strong>code PIN</strong> qui protège l'accès à ton compte. Garde-le secret : ne le donne à personne, même à
          quelqu'un qui se présente comme Teliyaa. Nous ne te le demanderons jamais par message ou par téléphone.
        </li>
        <li>Si tu penses que quelqu'un a accès à ton compte, change ton code PIN et écris-nous à <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>.</li>
        <li>Tu peux supprimer ton compte à tout moment : <strong>Profil → Supprimer mon compte</strong>.</li>
      </ul>

      <h2>3. Ce que tu t'engages à faire</h2>
      <ul>
        <li>Indiquer ton vrai nom et n'ajouter que des alias de comptes <strong>qui t'appartiennent</strong>.</li>
        <li>Garder tes alias à jour, et supprimer ceux que tu n'utilises plus.</li>
      </ul>
      <p>Il est interdit :</p>
      <ul>
        <li>de te faire passer pour quelqu'un d'autre, une entreprise ou une institution (pseudo, nom ou alias trompeur) ;</li>
        <li>d'utiliser Teliyaa pour des arnaques, du blanchiment d'argent ou toute activité illégale ;</li>
        <li>de collecter en masse les numéros ou alias des utilisateurs, ou de tester des listes de numéros ;</li>
        <li>de perturber le service (attaques, robots, contournement des limites).</li>
      </ul>

      <h2>4. Avant de payer : vérifie le nom</h2>
      <p>
        <strong>Teliyaa ne vérifie pas l'identité des utilisateurs</strong> : seul le numéro de téléphone est confirmé. Le nom affiché est
        celui que la personne a choisi. Avant de valider un paiement, regarde le <strong>nom du titulaire</strong> que ton application de
        paiement affiche. Si ce n'est pas la personne que tu veux payer, n'envoie pas.
      </p>

      <h2>5. Responsabilité</h2>
      <ul>
        <li>
          Les paiements sont faits par toi, dans ton application de paiement, sous la responsabilité de ton établissement. Teliyaa n'est pas
          responsable d'un paiement envoyé au mauvais compte, d'un montant erroné, d'un paiement non reçu ou des frais appliqués.
        </li>
        <li>Chaque utilisateur est responsable des informations qu'il publie (nom, pseudo, alias).</li>
        <li>
          En cas de problème avec un paiement, contacte ton établissement (Wave, Orange Money, MTN, Moov, ta banque). Tu peux aussi nous
          signaler un compte suspect à <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>.
        </li>
        <li>
          Nous faisons de notre mieux pour que Teliyaa fonctionne bien et en continu, mais le service est fourni tel quel : il peut être
          interrompu (maintenance, panne) et l'ouverture des applications de paiement dépend de ces applications et de ton téléphone.
        </li>
      </ul>

      <h2>6. Suspension</h2>
      <p>
        Nous pouvons masquer un profil, suspendre ou supprimer un compte qui ne respecte pas ces conditions, en particulier en cas de
        signalement de fraude ou d'usurpation d'identité.
      </p>

      <h2>7. Tes données</h2>
      <p>
        L'utilisation de tes données (numéro, contacts, alias) est expliquée dans la
        <RouterLink to="/confidentialite">politique de confidentialité</RouterLink>.
      </p>

      <h2>8. Prix</h2>
      <p>Teliyaa est gratuit. Si cela devait changer, tu en serais prévenu à l'avance et rien ne te serait facturé sans ton accord.</p>

      <h2>9. Modifications</h2>
      <p>
        Ces conditions peuvent évoluer. En cas de changement important, nous te prévenons dans l'application. Continuer à utiliser Teliyaa
        après ce changement vaut acceptation des nouvelles conditions.
      </p>

      <h2>10. Droit applicable et contact</h2>
      <p>
        Ces conditions sont soumises au droit ivoirien. En cas de désaccord, nous chercherons d'abord une solution amiable avec toi. Pour
        toute question : <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>.
      </p>
    </article>
  </PublicShell>
</template>
