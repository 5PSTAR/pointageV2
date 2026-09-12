// GET /api/salarie/accueil — profil, alerte oubli, mission en cours
import { T, lister, referentiels, lirePointage, F, lien, nomOption, aujourdhuiParis, echapper, envoyerErreur } from '../airtable.js';
import { exigerSalarie, profil, siennes } from '../salarie.js';

export default async function handler(req, res) {
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const auj = aujourdhuiParis();
    const mois = auj.slice(0, 7);
    const refs = await referentiels();

    const bruts = siennes(await lister(T.POINTAGES, {
      formule: `AND({Salarié} = '${echapper(F(salarie, 'Nom') || '')}', DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}')`,
      tri: [{ field: "Heure d'arrivée", direction: 'desc' }],
    }), salarie);
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
    const affectations = siennes(await lister(T.AFFECTATIONS, {
      formule: `AND({Salarié} = '${echapper(F(salarie, 'Nom') || '')}', IS_SAME({Date prévue}, '${auj}', 'day'))`,
    }), salarie);
    // Une mission annulée n'est plus « la prochaine » : on passe à la suivante.
    const prochaine = affectations.filter((a) => nomOption(F(a, 'Statut')) !== 'Annulé').map((a) => {
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
      // Liste servie d'avance : elle alimente la saisie manuelle, qui doit
      // rester utilisable au moment précis où le scan ne l'est pas.
      hotels: refs.hotels.map((h) => ({ id: h.id, nom: F(h, 'Nom'), ville: F(h, 'Ville') || '' }))
        .sort((x, y) => String(x.nom).localeCompare(String(y.nom), 'fr')),
      prestations: refs.prestations.map((p) => ({ id: p.id, type: F(p, 'Type de prestation') })),
    });
  } catch (err) { envoyerErreur(res, err); }
}
