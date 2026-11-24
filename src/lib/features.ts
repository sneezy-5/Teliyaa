/**
 * Fonctions activées dans cette version. Passer à `true` pour les remettre :
 * le code, les écrans et la base sont conservés.
 */
export const FEATURES = {
  /**
   * Demandes de paiement (montant + lien /r/CODE à partager).
   * Désactivé en v1 : on ne peut pas vérifier si la personne a vraiment payé,
   * donc la confirmation reste compliquée pour l'utilisateur.
   */
  paymentRequests: false,
  /**
   * « Tu as payé ? » après un envoi, puis « Bien reçu / Pas reçu » côté destinataire, et l'onglet Activité.
   * Désactivé en v1 pour la même raison : tonapp est un annuaire, le reçu vient de Wave / Orange Money / la banque.
   */
  paymentDeclarations: false
} as const;
