// GET /api/salarie/missions — missions à venir (affectations) + historique (pointages)
import { T, lister, referentiels, lirePointage, F, lien, nomOption, aujourdhuiParis, moisDecale, echapper, envoyerErreur } from '../airtable.js';
import { exigerSalarie, siennes } from '../salarie.js';

export default async function handler(req, res) {
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const nom = echapper(F(salarie, 'Nom') || '');
    const auj = aujourdhuiParis();
    const refs = await referentiels();

    // L'historique est borné dans le temps : sans cela on rapatrie tous les
    // pointages depuis toujours pour n'en afficher que trente.
    const depuis = moisDecale(auj.slice(0, 7), -5) + '-01';
    const [bruts, affectations] = await Promise.all([
      lister(T.POINTAGES, {
        formule: `AND({Salarié} = '${nom}', IS_AFTER({Heure d'arrivée}, '${depuis}'))`,
        tri: [{ field: "Heure d'arrivée", direction: 'desc' }],
      }),
      lister(T.AFFECTATIONS, {
        formule: `AND({Salarié} = '${nom}', IS_AFTER({Date prévue}, DATEADD('${auj}', -1, 'days')))`,
        tri: [{ field: 'Date prévue', direction: 'asc' }],
      }),
    ]);

    const historique = siennes(bruts, salarie).map((p) => lirePointage(p, refs)).slice(0, 30);

    // Une mission annulée ne lui est plus confiée : elle sort de sa liste.
    const aVenir = siennes(affectations, salarie)
      .filter((a) => nomOption(F(a, 'Statut')) !== 'Annulé').map((a) => {
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
