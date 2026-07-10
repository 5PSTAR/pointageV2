// GET /api/admin/dashboard — KPI temps réel, en cours, alertes, derniers pointages, mini-calendrier
import { T, lister, referentiels, lirePointage, F, lien, aujourdhuiParis, heureParis } from '../_lib/airtable.js';

export default async function handler(req, res) {
  try {
    const auj = aujourdhuiParis();
    const mois = auj.slice(0, 7);
    const refs = await referentiels();

    const [pointagesMois, affectationsJour] = await Promise.all([
      lister(T.POINTAGES, {
        formule: `DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}'`,
        tri: [{ field: "Heure d'arrivée", direction: 'desc' }],
      }),
      lister(T.AFFECTATIONS, { formule: `IS_SAME({Date prévue}, '${auj}', 'day')` }),
    ]);

    const tous = pointagesMois.map((p) => lirePointage(p, refs));
    const duJour = tous.filter((p) => p.date === auj);
    const enCours = tous.filter((p) => p.statut === 'En cours');
    const anomalies = tous.filter((p) => p.statut === 'Anomalie');

    // Alerte 1 : affectation du jour, heure prévue dépassée, aucun pointage correspondant
    const maintenant = heureParis();
    const manquants = [];
    for (const a of affectationsJour) {
      const salarieId = lien(a, 'Salarié');
      const hotelId = lien(a, 'Hôtel');
      const heurePrevue = F(a, 'Heure prévue') || '00:00';
      if (heurePrevue > maintenant) continue; // pas encore l'heure
      const pointe = duJour.some((p) => p.salarieId === salarieId && p.hotelId === hotelId);
      if (!pointe) {
        const salarie = refs.iSalaries[salarieId];
        const hotel = refs.iHotels[hotelId];
        const presta = refs.iPrestations[lien(a, 'Service prévu')];
        manquants.push({
          type: 'manquant',
          affectationId: a.id,
          salarie: salarie ? F(salarie, 'Nom') : '—',
          telephone: salarie ? F(salarie, 'Téléphone') : null,
          hotel: hotel ? F(hotel, 'Nom') : '—',
          prestation: presta ? F(presta, 'Type de prestation') : '—',
          heurePrevue,
        });
      }
    }

    // Alerte 2 : anomalies + "En cours" depuis plus de 12 h (oubli de départ probable)
    const seuil = Date.now() - 12 * 3_600_000;
    const oublis = enCours.filter((p) => new Date(p.arrivee).getTime() < seuil)
      .map((p) => ({ type: 'oubli', ...p }));
    const alertesAnomalies = anomalies.map((p) => ({ type: 'anomalie', ...p }));

    // Mini-calendrier du mois : pastilles par jour
    const calendrier = {};
    for (const p of tous) {
      if (!p.date) continue;
      calendrier[p.date] = calendrier[p.date] || { fait: false, prevu: false, anomalie: false };
      if (p.statut === 'Terminée') calendrier[p.date].fait = true;
      if (p.statut === 'En cours') calendrier[p.date].prevu = true;
      if (p.statut === 'Anomalie') calendrier[p.date].anomalie = true;
    }
    const affectationsMois = await lister(T.AFFECTATIONS, {
      formule: `DATETIME_FORMAT({Date prévue}, 'YYYY-MM') = '${mois}'`, champs: ['Date prévue'],
    });
    for (const a of affectationsMois) {
      const d = F(a, 'Date prévue');
      if (!d || d < auj) continue;
      calendrier[d] = calendrier[d] || { fait: false, prevu: false, anomalie: false };
      calendrier[d].prevu = true;
    }

    const terminees = duJour.filter((p) => p.statut === 'Terminée');
    const chiffreMois = Math.round(tous
      .filter((p) => p.statut === 'Terminée' && p.duree && p.tarifFacturation)
      .reduce((s, p) => s + p.duree * p.tarifFacturation, 0) * 100) / 100;
    res.json({
      date: auj,
      kpi: {
        enCours: enCours.filter((p) => p.date === auj || new Date(p.arrivee).getTime() >= seuil).length,
        heuresJour: Math.round(terminees.reduce((s, p) => s + (p.duree || 0), 0) * 100) / 100,
        alertes: manquants.length + oublis.length + alertesAnomalies.length,
        termineesJour: terminees.length,
        chiffreMois,
      },
      enCours: enCours.slice(0, 10),
      alertes: [...manquants, ...oublis, ...alertesAnomalies].slice(0, 12),
      derniers: tous.filter((p) => p.statut !== 'En cours' || true).slice(0, 6),
      calendrier,
    });
  } catch (err) { const { envoyerErreur } = await import('../_lib/airtable.js'); envoyerErreur(res, err); }
}
