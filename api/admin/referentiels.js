// GET — listes pour les filtres et formulaires
import { referentiels, F, envoyerErreur } from '../_lib/airtable.js';

export default async function handler(req, res) {
  try {
    const refs = await referentiels();
    res.json({
      salaries: refs.salaries.map((s) => ({ id: s.id, nom: F(s, 'Nom'), telephone: F(s, 'Téléphone'), taux: F(s, 'Taux Horaire') })),
      hotels: refs.hotels.map((h) => ({ id: h.id, nom: F(h, 'Nom'), adresse: F(h, 'Adresse') })),
      prestations: refs.prestations.map((p) => ({ id: p.id, type: F(p, 'Type de prestation'), tarif: F(p, 'Tarif horaire facturation') })),
    });
  } catch (err) { envoyerErreur(res, err); }
}
