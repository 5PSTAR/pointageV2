// GET — listes pour les filtres et formulaires
import { referentiels, F, nomOption, envoyerErreur } from '../airtable.js';
import { EMETTEUR } from './gabarit.js';

export default async function handler(req, res) {
  try {
    const refs = await referentiels();
    res.json({
      // Bloc émetteur servi ici plutôt que recopié côté écran : l'éditeur de
      // facture montre le document tel qu'il sortira, il doit lire la même
      // source que le PDF.
      emetteur: EMETTEUR,
      salaries: refs.salaries.map((s) => ({ id: s.id, nom: F(s, 'Nom'), telephone: F(s, 'Téléphone'), taux: F(s, 'Taux Horaire') })),
      hotels: refs.hotels.map((h) => ({
        id: h.id,
        nom: F(h, 'Nom'),
        adresse: F(h, 'Adresse'),
        codePostal: F(h, 'Code postal') || '',
        ville: F(h, 'Ville') || '',
        contact: F(h, 'Contact principal') || '',
        codeClient: F(h, 'Code client') || '',
        emailFacturation: F(h, 'Contact facturation') || '',
        categorie: nomOption(F(h, 'Catégorie')),
        typeClient: nomOption(F(h, 'Type de client')),
        tva: F(h, 'N° TVA intracommunautaire') || '',
        delaiPaiement: F(h, 'Délai de paiement (jours)') ?? null,
        actif: F(h, 'Actif') !== false,
      })),
      // Un tarif par catégorie d'hôtel : c'est le classement de l'hôtel facturé
      // qui décide lequel s'applique.
      prestations: refs.prestations.map((p) => ({
        id: p.id,
        type: nomOption(F(p, 'Type de prestation')),
        tarif3: F(p, 'Tarif 3 étoiles') ?? null,
        tarif4: F(p, 'Tarif 4 étoiles') ?? null,
      })),
    });
  } catch (err) { envoyerErreur(res, err); }
}
