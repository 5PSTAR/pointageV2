// Modèles de messages préremplis, tous modifiables avant envoi.
// Aucun envoi automatique : l'application ouvre un brouillon, une personne
// relit et décide. Les références légales reprennent celles du pied de facture.
import { eur, dateFr, periodeFr } from './statuts.js';

const SIGNATURE = '\n\nCordialement,\nL’équipe 5P STAR';

export function modeleFacture(f) {
  return {
    objet: `Facture 5P STAR – ${periodeFr(f.mois)} – ${f.hotel}`,
    message:
      'Bonjour,\n\n' +
      `Veuillez trouver ci-joint la facture ${f.numero} pour la période de ${periodeFr(f.mois)}.\n\n` +
      `Montant : ${eur(f.totalTTC)} TTC\n` +
      `Échéance : ${dateFr(f.dateEcheance)}\n\n` +
      'Nous restons à votre disposition pour toute question.' + SIGNATURE,
  };
}

export function modeleRelance(f, niveau) {
  if (niveau === 1) {
    return {
      objet: `Rappel – Facture ${f.numero} arrivée à échéance`,
      message:
        'Bonjour,\n\n' +
        `Sauf erreur de notre part, nous n’avons pas encore reçu le règlement de la facture ${f.numero} ` +
        `d’un montant de ${eur(f.totalTTC)}, arrivée à échéance le ${dateFr(f.dateEcheance)}.\n\n` +
        'Nous vous remercions de bien vouloir procéder à son règlement ou de nous indiquer si celui-ci ' +
        'a déjà été effectué.' + SIGNATURE,
    };
  }
  if (niveau === 2) {
    return {
      objet: `Relance – Facture ${f.numero} impayée depuis ${f.joursRetard} jours`,
      message:
        'Bonjour,\n\n' +
        `Malgré notre précédent rappel, la facture ${f.numero} d’un montant de ${eur(f.totalTTC)}, ` +
        `échue le ${dateFr(f.dateEcheance)}, demeure impayée à ce jour, soit ${f.joursRetard} jours de retard.\n\n` +
        'Nous vous demandons de bien vouloir régulariser cette situation sous huitaine. Si le règlement ' +
        'a été émis entre-temps, merci de nous en communiquer la référence.' + SIGNATURE,
    };
  }
  return {
    objet: `Mise en demeure – Facture ${f.numero}`,
    message:
      'Bonjour,\n\n' +
      `Nos relances précédentes sont restées sans réponse. La facture ${f.numero}, d’un montant de ` +
      `${eur(f.totalTTC)}, est échue depuis le ${dateFr(f.dateEcheance)}, soit ${f.joursRetard} jours de retard.\n\n` +
      'Nous vous mettons en demeure de procéder à son règlement sous huit jours. À défaut, nous nous ' +
      'réservons le droit d’appliquer les pénalités de retard prévues à l’article L.441-10 du Code de ' +
      'commerce, ainsi que l’indemnité forfaitaire de 40 € pour frais de recouvrement.' + SIGNATURE,
  };
}

/** Brouillon dans la messagerie de l'administrateur — la pièce jointe se met à la main. */
export const lienMailto = (destinataire, objet, message) =>
  `mailto:${String(destinataire || '').trim()}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(message)}`;
