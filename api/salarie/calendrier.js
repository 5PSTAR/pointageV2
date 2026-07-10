// GET /api/salarie/calendrier?mois=AAAA-MM — pointages passés/en cours + affectations futures
import { T, lister, referentiels, lirePointage, F, lien, aujourdhuiParis, echapper, envoyerErreur } from '../_lib/airtable.js';
import { exigerSalarie } from '../_lib/salarie.js';

export default async function handler(req, res) {
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const nom = echapper(F(salarie, 'Nom') || '');
    const auj = aujourdhuiParis();
    const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : auj.slice(0, 7);
    const refs = await referentiels();

    const [bruts, affectations] = await Promise.all([
      lister(T.POINTAGES, {
        formule: `AND({Salarié} = '${nom}', DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}')`,
      }),
      lister(T.AFFECTATIONS, {
        formule: `AND({Salarié} = '${nom}', DATETIME_FORMAT({Date prévue}, 'YYYY-MM') = '${mois}')`,
      }),
    ]);

    const items = bruts.map((p) => ({ genre: 'pointage', ...lirePointage(p, refs) }));

    for (const a of affectations) {
      const date = F(a, 'Date prévue');
      if (!date) continue;
      const hotelId = lien(a, 'Hôtel');
      // Ne pas dupliquer une affectation déjà pointée
      if (items.some((p) => p.date === date && p.hotelId === hotelId)) continue;
      const h = refs.iHotels[hotelId];
      const p = refs.iPrestations[lien(a, 'Service prévu')];
      items.push({
        genre: 'affectation',
        id: a.id,
        date,
        hotel: h ? F(h, 'Nom') : '—',
        prestation: p ? F(p, 'Type de prestation') : '—',
        heurePrevue: F(a, 'Heure prévue') || null,
        statut: date < auj ? 'Non réalisée' : 'Prévue',
      });
    }

    res.json({ mois, aujourdhui: auj, items });
  } catch (err) { envoyerErreur(res, err); }
}
