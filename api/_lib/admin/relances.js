// Relances sur factures impayées.
// GET  ?facture=recX        → historique des relances de cette facture
// POST { factureId, … }     → enregistre une relance envoyée
//
// Aucune relance n'est envoyée automatiquement : l'application prépare le
// message, une personne le relit et décide. Cet endpoint ne fait qu'archiver
// ce qui est parti, pour garder l'historique.
import { T, lister, creer, modifier, F, lien, nomOption, aujourdhuiParis, envoyerErreur } from '../airtable.js';

const NIVEAUX = ['Relance 1', 'Relance 2', 'Relance 3'];

function lireRelance(r) {
  return {
    id: r.id,
    factureId: lien(r, 'Facture'),
    niveau: nomOption(F(r, 'Niveau')),
    date: F(r, "Date d'envoi") || null,
    destinataire: F(r, 'Destinataire') || '',
    objet: F(r, 'Objet') || '',
    message: F(r, 'Message') || '',
    statut: nomOption(F(r, 'Statut')),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { factureId, niveau, destinataire, objet, message, statut } = req.body || {};
      if (!/^rec[A-Za-z0-9]{14}$/.test(factureId || '')) {
        return res.status(400).json({ error: 'Identifiant de facture invalide.' });
      }
      const n = Number(niveau);
      if (!NIVEAUX[n - 1]) return res.status(400).json({ error: 'Niveau de relance invalide (1, 2 ou 3).' });

      // On ne relance qu'une facture en retard : le champ Statut d'Airtable est
      // aligné sur ce constat, pour qu'il cesse d'afficher « Envoyée » sur une
      // facture manifestement impayée. Les factures réglées, annulées ou
      // transformées en avoir ne sont pas touchées.
      const [facture] = await lister(T.FACTURES, { formule: `RECORD_ID() = '${factureId}'` });
      if (facture && nomOption(F(facture, 'Statut')) === 'Envoyée' && !F(facture, 'Date de paiement')) {
        await modifier(T.FACTURES, factureId, { 'Statut': 'Retard' });
      }

      const cree = await creer(T.RELANCES, {
        'Facture': [factureId],
        'Niveau': NIVEAUX[n - 1],
        "Date d'envoi": aujourdhuiParis(),
        'Destinataire': String(destinataire || '').trim(),
        'Objet': String(objet || '').trim(),
        'Message': String(message || ''),
        'Statut': statut === 'Préparée' ? 'Préparée' : 'Envoyée',
      });
      return res.json({ ok: true, id: cree.id });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

    const { facture } = req.query;
    const toutes = await lister(T.RELANCES, { tri: [{ field: "Date d'envoi", direction: 'desc' }] });
    let relances = toutes.map(lireRelance);
    if (facture) relances = relances.filter((r) => r.factureId === facture);
    res.json({ relances });
  } catch (err) { envoyerErreur(res, err); }
}
