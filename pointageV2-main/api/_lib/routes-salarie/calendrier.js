// GET /api/salarie/calendrier?mois=AAAA-MM — pointages passés/en cours + affectations futures
import { T, lister, referentiels, lirePointage, F, lien, nomOption, aujourdhuiParis, echapper, envoyerErreur } from '../airtable.js';
import { exigerSalarie, siennes } from '../salarie.js';
import { appliquerPauseParClient } from '../pause.js';

/** Adresse complète, pour savoir où se rendre la veille au soir. */
const adresseDe = (h) => (h
  ? [F(h, 'Adresse'), [F(h, 'Code postal'), F(h, 'Ville')].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')
  : '');

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

    // Mêmes heures que la paie, et l'adresse pour savoir où l'on va.
    const lus = appliquerPauseParClient(siennes(bruts, salarie).map((p) => lirePointage(p, refs)), refs);
    const items = lus.map((p) => ({
      genre: 'pointage',
      ...p,
      adresse: adresseDe(refs.iHotels[p.hotelId]),
      gain: p.duree && p.tauxHoraireSalarie ? Math.round(p.duree * p.tauxHoraireSalarie * 100) / 100 : null,
    }));

    for (const a of siennes(affectations, salarie)) {
      const date = F(a, 'Date prévue');
      if (!date) continue;
      // Une mission annulée ne la concerne plus : elle disparaît de son planning
      // plutôt que de l'encombrer.
      const statutSaisi = nomOption(F(a, 'Statut'));
      if (statutSaisi === 'Annulé') continue;
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
        adresse: adresseDe(h),
        prestation: p ? F(p, 'Type de prestation') : '—',
        heurePrevue: F(a, 'Heure prévue') || null,
        // Les consignes que l'admin écrit sur l'affectation ne parvenaient
        // jamais jusqu'ici — elles n'existaient que dans l'onglet Missions.
        commentaires: F(a, 'Commentaires') || '',
        statut: statutSaisi === 'Effectué' ? 'Effectué' : date < auj ? 'Non réalisée' : 'Prévue',
      });
    }

    // Totaux du mois affiché : « septembre : 87 h · 1 044 € » répond à
    // « mes données clés » sans ajouter un écran de plus.
    const faits = items.filter((x) => x.genre === 'pointage' && x.statut === 'Terminée' && x.duree);
    const heures = Math.round(faits.reduce((s2, x) => s2 + x.duree, 0) * 100) / 100;
    res.json({
      mois,
      aujourdhui: auj,
      items,
      total: {
        heures,
        gains: Math.round(faits.reduce((s2, x) => s2 + (x.gain || 0), 0) * 100) / 100,
        missions: faits.length,
      },
    });
  } catch (err) { envoyerErreur(res, err); }
}
