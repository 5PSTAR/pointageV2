// GET /api/admin/calendrier?mois=AAAA-MM — pointages (passé) + affectations (futur) par jour
import { T, lister, referentiels, lirePointage, F, lien, nomOption, aujourdhuiParis, envoyerErreur } from '../airtable.js';

/**
 * État d'une affectation : le statut saisi prime quand il tranche (annulée,
 * effectuée). Sinon il se déduit de la date — une prestation passée sans
 * pointage en face n'a pas été réalisée.
 */
const statutAffectation = (saisi, date, auj) => {
  if (saisi === 'Annulé' || saisi === 'Effectué') return saisi;
  return date < auj ? 'Non réalisée' : 'Prévue';
};

export default async function handler(req, res) {
  try {
    const mois = req.query.mois || aujourdhuiParis().slice(0, 7);
    const auj = aujourdhuiParis();
    const refs = await referentiels();

    const [pointages, affectations] = await Promise.all([
      lister(T.POINTAGES, { formule: `DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}'` }),
      lister(T.AFFECTATIONS, { formule: `DATETIME_FORMAT({Date prévue}, 'YYYY-MM') = '${mois}'` }),
    ]);

    const items = pointages.map((p) => ({ genre: 'pointage', ...lirePointage(p, refs) }));

    // Les affectations futures (ou du jour sans pointage) apparaissent comme "prévues"
    for (const a of affectations) {
      const date = F(a, 'Date prévue');
      if (!date) continue;
      const salarieId = lien(a, 'Salarié');
      const hotelId = lien(a, 'Hôtel');
      const dejaPointee = date <= auj && items.some(
        (p) => p.date === date && p.salarieId === salarieId && p.hotelId === hotelId
      );
      if (dejaPointee) continue;
      const salarie = refs.iSalaries[salarieId];
      const hotel = refs.iHotels[hotelId];
      const presta = refs.iPrestations[lien(a, 'Service prévu')];
      items.push({
        genre: 'affectation',
        id: a.id,
        date,
        // Identifiants repris tels quels : la modale de planification en a
        // besoin pour pré-remplir ses listes déroulantes.
        salarieId, clientId: hotelId, prestationId: lien(a, 'Service prévu'),
        salarie: salarie ? F(salarie, 'Nom') : '—',
        telephone: salarie ? F(salarie, 'Téléphone') : null,
        hotel: hotel ? F(hotel, 'Nom') : '—',
        prestation: presta ? F(presta, 'Type de prestation') : '—',
        heurePrevue: (F(a, 'Heure prévue') || '').trim() || null,
        statut: statutAffectation(nomOption(F(a, 'Statut')), date, auj),
        commentaires: F(a, 'Commentaires') || '',
      });
    }

    res.json({ mois, aujourdhui: auj, items });
  } catch (err) { envoyerErreur(res, err); }
}
