// GET /api/salarie/missions — missions à venir (affectations) + historique (pointages)
import { T, lister, referentiels, lirePointage, F, lien, aujourdhuiParis, echapper, envoyerErreur } from '../_lib/airtable.js';
import { exigerSalarie } from '../_lib/salarie.js';

export default async function handler(req, res) {
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const nom = echapper(F(salarie, 'Nom') || '');
    const auj = aujourdhuiParis();
    const refs = await referentiels();

    const [bruts, affectations] = await Promise.all([
      lister(T.POINTAGES, {
        formule: `{Salarié} = '${nom}'`,
        tri: [{ field: "Heure d'arrivée", direction: 'desc' }],
      }),
      lister(T.AFFECTATIONS, {
        formule: `AND({Salarié} = '${nom}', IS_AFTER({Date prévue}, DATEADD('${auj}', -1, 'days')))`,
        tri: [{ field: 'Date prévue', direction: 'asc' }],
      }),
    ]);

    const historique = bruts.map((p) => lirePointage(p, refs)).slice(0, 30);

    const aVenir = affectations.map((a) => {
      const h = refs.iHotels[lien(a, 'Hôtel')];
      const p = refs.iPrestations[lien(a, 'Service prévu')];
      return {
        id: a.id,
        date: F(a, 'Date prévue'),
        heurePrevue: F(a, 'Heure prévue') || null,
        hotel: h ? F(h, 'Nom') : '—',
        adresse: h ? F(h, 'Adresse') : '',
        prestation: p ? F(p, 'Type de prestation') : '—',
        commentaires: F(a, 'Commentaires') || '',
      };
    }).slice(0, 15);

    res.json({ aVenir, historique });
  } catch (err) { envoyerErreur(res, err); }
}
