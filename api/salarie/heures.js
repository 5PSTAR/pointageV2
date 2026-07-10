// GET /api/salarie/heures — gains semaine / mois en cours / mois dernier + prestation en cours + badges
import { T, lister, referentiels, lirePointage, F, aujourdhuiParis, lundiCourant, moisDecale, echapper, envoyerErreur } from '../_lib/airtable.js';
import { exigerSalarie, profil } from '../_lib/salarie.js';

const arrondi = (n) => Math.round(n * 100) / 100;

export default async function handler(req, res) {
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const p = profil(salarie);
    const taux = p.tauxHoraire || 0;
    const nom = echapper(p.nom);
    const auj = aujourdhuiParis();
    const moisCourant = auj.slice(0, 7);
    const moisPrecedent = moisDecale(moisCourant, -1);
    const lundi = lundiCourant();
    const refs = await referentiels();

    const bruts = await lister(T.POINTAGES, {
      formule: `AND({Salarié} = '${nom}', OR(DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${moisCourant}', DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${moisPrecedent}'))`,
    });
    const pointages = bruts.map((x) => lirePointage(x, refs));
    const terminees = pointages.filter((x) => x.statut === 'Terminée' && x.duree);

    const cumul = (filtre) => {
      const lot = terminees.filter(filtre);
      const heures = arrondi(lot.reduce((s, x) => s + x.duree, 0));
      return { heures, gains: arrondi(heures * taux), nb: lot.length };
    };

    const semaine = cumul((x) => x.date >= lundi && x.date <= auj);
    const moisCi = cumul((x) => x.date?.startsWith(moisCourant));
    const moisDer = cumul((x) => x.date?.startsWith(moisPrecedent));

    // Prestation en cours : compteur qui tourne côté client
    const enCoursBrut = pointages.find((x) => x.statut === 'En cours');
    const enCours = enCoursBrut ? {
      hotel: enCoursBrut.hotel,
      prestation: enCoursBrut.prestation,
      arrivee: enCoursBrut.arrivee,
      tauxHoraire: taux,
    } : null;

    // Badges : uniquement comparés à soi-même, jamais aux collègues
    const anomaliesMois = pointages.filter((x) => x.date?.startsWith(moisCourant) && x.statut === 'Anomalie').length;
    const badges = [
      { id: 'cap100', libelle: '100 h/mois', obtenu: moisCi.heures >= 100, ton: 'bleu' },
      { id: 'zeroAnomalie', libelle: 'Zéro anomalie', obtenu: anomaliesMois === 0 && moisCi.nb > 0, ton: 'vert' },
      { id: 'reguliere', libelle: 'Régulière', obtenu: moisCi.nb >= 10, ton: 'orange' },
    ];

    res.json({
      profil: p,
      tauxHoraire: taux,
      tauxManquant: !taux,
      enCours,
      semaine, moisCi, moisDer,
      badges,
    });
  } catch (err) { envoyerErreur(res, err); }
}
