// GET /api/salarie/accueil — profil, alerte oubli, mission en cours
import { T, lister, referentiels, lirePointage, F, lien, aujourdhuiParis, envoyerErreur } from '../_lib/airtable.js';
import { exigerSalarie, profil } from '../_lib/salarie.js';

export default async function handler(req, res) {
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const auj = aujourdhuiParis();
    const mois = auj.slice(0, 7);
    const refs = await referentiels();

    const bruts = await lister(T.POINTAGES, {
      formule: `AND({Salarié} = '${(F(salarie, 'Nom') || '').replace(/'/g, "\\'")}', DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}')`,
      tri: [{ field: "Heure d'arrivée", direction: 'desc' }],
    });
    const pointages = bruts.map((p) => lirePointage(p, refs));

    const enCours = pointages.find((p) => p.statut === 'En cours') || null;

    // Alerte : anomalie récente, ou "En cours" ouvert depuis plus de 12 h
    const seuil = Date.now() - 12 * 3_600_000;
    let alerte = null;
    const anomalie = pointages.find((p) => p.statut === 'Anomalie');
    if (enCours && new Date(enCours.arrivee).getTime() < seuil) {
      alerte = {
        type: 'depart-oublie',
        titre: 'Oubli de pointage ?',
        message: `Ta mission au ${enCours.hotel} est ouverte depuis plus de 12 h. Scanne ton départ ou préviens ton responsable.`,
      };
    } else if (anomalie) {
      alerte = {
        type: 'anomalie',
        titre: 'Oubli de pointage ?',
        message: `Ta mission du ${new Date(anomalie.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} au ${anomalie.hotel} n'a pas de départ scanné — préviens ton responsable.`,
      };
    }

    // Prochaine mission planifiée (pour le cas où rien n'est en cours)
    const affectations = await lister(T.AFFECTATIONS, {
      formule: `AND({Salarié} = '${(F(salarie, 'Nom') || '').replace(/'/g, "\\'")}', IS_SAME({Date prévue}, '${auj}', 'day'))`,
    });
    const prochaine = affectations.map((a) => {
      const h = refs.iHotels[lien(a, 'Hôtel')];
      const p = refs.iPrestations[lien(a, 'Service prévu')];
      return {
        hotel: h ? F(h, 'Nom') : '—',
        prestation: p ? F(p, 'Type de prestation') : '—',
        heurePrevue: F(a, 'Heure prévue') || null,
      };
    })[0] || null;

    res.json({
      profil: profil(salarie),
      date: auj,
      alerte,
      enCours,
      prochaine,
    });
  } catch (err) { envoyerErreur(res, err); }
}
