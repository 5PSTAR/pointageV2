// Vocabulaire commun à tout l'onglet Facturation : libellés, couleurs, mise en
// forme. Le statut lui-même est calculé côté serveur (factures.js) à partir des
// dates — ici on ne fait que l'habiller.

export const STATUTS = {
  a_facturer: { libelle: 'À facturer',      chip: 'gris' },
  brouillon:  { libelle: 'Facture générée', chip: 'bleu' },
  en_attente: { libelle: 'En attente',      chip: 'orange' },
  en_retard:  { libelle: 'En retard',       chip: 'rouge' },
  payee:      { libelle: 'Payée',           chip: 'vert' },
  annulee:    { libelle: 'Annulée',         chip: 'gris' },
  avoir:      { libelle: 'Avoir',           chip: 'violet' },
};

export const libelleStatut = (s) => STATUTS[s]?.libelle || s || '—';
export const chipStatut = (s) => STATUTS[s]?.chip || 'gris';

/** Actions proposées selon l'état : on ne relance pas une facture payée. */
export function actionsPossibles(f) {
  if (f.statut === 'a_facturer') return ['generer'];
  const base = ['voir', 'pdf', 'excel'];
  if (f.statut === 'brouillon') return [...base, 'envoyer', 'payer', 'annuler'];
  // L'avoir n'est proposé que sur une facture DÉJÀ PARTIE : le client en détient
  // un exemplaire, on ne peut plus la corriger, il faut une pièce de sens inverse.
  // Sur un brouillon, c'est « annuler » qu'il faut, pas un avoir.
  if (f.statut === 'en_attente') return [...base, 'envoyer', 'payer', 'relancer', 'avoir', 'annuler'];
  if (f.statut === 'en_retard') return [...base, 'relancer', 'payer', 'envoyer', 'avoir', 'annuler'];
  if (f.statut === 'payee') return [...base, 'annuler-paiement', 'avoir'];
  return base; // annulée, avoir : consultation seule
}

export const LIBELLES_ACTIONS = {
  generer: 'Générer la facture',
  voir: 'Voir la facture',
  pdf: 'Télécharger le PDF',
  excel: 'Télécharger l’Excel',
  envoyer: 'Envoyer par email',
  payer: 'Marquer comme payée',
  relancer: 'Préparer une relance',
  annuler: 'Annuler la facture',
  'annuler-paiement': 'Annuler le paiement',
  avoir: 'Émettre un avoir',
};

// ── Mise en forme ─────────────────────────────────────────────────────
export const eur = (n) =>
  (n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
export const eurCourt = (n) =>
  (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
export const dateFr = (iso) =>
  iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR') : '—';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const periodeFr = (mois) => {
  if (!mois) return '—';
  const [a, m] = mois.split('-').map(Number);
  return `${MOIS[m - 1]} ${a}`;
};

/**
 * Intitulé d'un document de facture : numéro - mois facturé - année sur deux
 * chiffres (ex. F26-001-09-26). Doit rester aligné sur le nom de fichier
 * produit par le serveur dans facture.js.
 */
export const nomFichierFacture = (f) => (f.numero && f.mois
  ? `${f.numero}-${f.mois.slice(5, 7)}-${f.mois.slice(2, 4)}`
  : `facture-${f.mois || ''}`);

/** Lien d'export : une facture émise s'exporte par son identifiant, figée. */
export const lienExport = (f, format) => (f.id
  ? `/api/admin/facture?facture=${f.id}&format=${format}`
  : `/api/admin/facture?hotel=${f.hotelId}&mois=${f.mois}&format=${format}`);
