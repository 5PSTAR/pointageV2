// GET /api/admin/calendrier?mois=AAAA-MM — pointages (passé) + affectations (futur) par jour
import { T, lister, referentiels, lirePointage, F, lien, aujourdhuiParis, envoyerErreur } from '../_lib/airtable.js';

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
        salarie: salarie ? F(salarie, 'Nom') : '—',
        telephone: salarie ? F(salarie, 'Téléphone') : null,
        hotel: hotel ? F(hotel, 'Nom') : '—',
        prestation: presta ? F(presta, 'Type de prestation') : '—',
        heurePrevue: F(a, 'Heure prévue') || null,
        statut: date < auj ? 'Non réalisée' : 'Prévue',
        commentaires: F(a, 'Commentaires') || '',
      });
    }

    res.json({ mois, aujourdhui: auj, items });
  } catch (err) { envoyerErreur(res, err); }
}
