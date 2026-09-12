// POST /api/salarie/scan { contenu: "PTG:recXXXX", prestationId?, horodatage?, confirmerDepart?, _source? }
// Arrivée si aucune mission en cours, sinon Départ.
// La prestation est déduite de l'affectation du jour ; à défaut, le client doit en choisir une.
import { T, lister, creer, modifier, referentiels, lirePointage, F, lien, nomOption, dateParis, envoyerErreur } from '../airtable.js';
import { exigerSalarie, siennes } from '../salarie.js';

// Un départ scanné dans la foulée de l'arrivée est presque toujours un double
// scan (réseau lent, la salariée rescanne) : une prestation de six heures
// deviendrait alors une ligne de douze secondes, donc une prestation perdue.
const SEUIL_DOUBLE_SCAN_MIN = 3;

// Un pointage parti de la file hors-ligne porte l'heure du scan, pas celle de
// l'envoi. On l'accepte jusqu'à deux jours ; au-delà, l'horloge du téléphone
// est trop douteuse pour fonder une facturation.
const AGE_MAX_H = 48;

/** Instant réel du scan : celui annoncé par le client s'il est plausible. */
function instantDuScan(horodatage) {
  if (!horodatage) return new Date();
  const t = new Date(horodatage);
  if (Number.isNaN(t.getTime())) return new Date();
  const ecart = Date.now() - t.getTime();
  if (ecart < -5 * 60_000 || ecart > AGE_MAX_H * 3_600_000) return new Date();
  return t;
}

const enFrancais = (minutes) => (minutes < 1 ? "à l'instant" : `il y a ${minutes} min`);

/**
 * Clôt l'affectation prévue correspondante : la prestation ayant eu lieu, son
 * statut passe à « Effectué » sans saisie manuelle — c'est le pointage qui fait
 * foi. Sans planification en face, il n'y a rien à marquer.
 *
 * L'échec est volontairement silencieux : le départ vient d'être enregistré,
 * une erreur ici afficherait un échec à la salariée alors que son pointage est
 * bien passé — et elle rescannerait pour rien.
 */
async function marquerAffectationEffectuee(salarie, jour, hotelId) {
  try {
    const affectations = siennes(await lister(T.AFFECTATIONS, {
      formule: `IS_SAME({Date prévue}, '${jour}', 'day')`,
    }), salarie);
    const prevue = affectations.find(
      (a) => lien(a, 'Hôtel') === hotelId && nomOption(F(a, 'Statut')) !== 'Annulé'
    );
    if (prevue) await modifier(T.AFFECTATIONS, prevue.id, { 'Statut': 'Effectué' });
  } catch (err) {
    console.error('Affectation non marquée effectuée :', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const { contenu, prestationId, horodatage, confirmerDepart, _source } = req.body || {};
    const estManuel = _source === 'manuel';
    const brut = String(contenu || '').trim();
    const m = brut.match(/^PTG:(rec[A-Za-z0-9]{14})$/) || brut.match(/\/q\/(rec[A-Za-z0-9]{14})(?:[/?#]|$)/);
    if (!m) return res.status(400).json({ error: "Ce QR code n'est pas un QR code 5P STAR." });
    const hotelId = m[1];

    const refs = await referentiels();
    const hotel = refs.iHotels[hotelId];
    if (!hotel) return res.status(404).json({ error: 'Hôtel inconnu. Préviens ton responsable.' });

    const instant = instantDuScan(horodatage);
    const jour = dateParis(instant);

    // ── Une mission est-elle déjà ouverte ? ──
    // On interroge sur le statut, pas sur le nom : la liste des missions
    // ouvertes tient en quelques lignes, et l'identifiant tranche les homonymes.
    const ouverts = siennes(await lister(T.POINTAGES, { formule: `{Statut} = 'En cours'` }), salarie)
      .map((p) => lirePointage(p, refs));

    if (ouverts.length) {
      const mission = ouverts[0];
      if (mission.hotelId !== hotelId) {
        return res.status(409).json({
          error: `Tu as une mission ouverte au ${mission.hotel}. Scanne d'abord le QR de cet hôtel pour la clôturer.`,
        });
      }

      const arrivee = new Date(mission.arrivee);
      const ecartMin = (instant - arrivee) / 60_000;
      if (ecartMin < SEUIL_DOUBLE_SCAN_MIN && !confirmerDepart) {
        return res.json({
          action: 'confirmer-depart',
          hotelId,
          hotel: mission.hotel,
          prestation: mission.prestation,
          minutes: Math.max(0, Math.round(ecartMin)),
          message: `Ton arrivée au ${mission.hotel} a été enregistrée ${enFrancais(Math.max(0, Math.round(ecartMin)))}. Est-ce déjà ton départ ?`,
        });
      }

      // Un horodatage antérieur à l'arrivée donnerait une durée négative.
      const fin = instant > arrivee ? instant : new Date();
      const duree = Math.round(((fin - arrivee) / 3_600_000) * 100) / 100;
      const champsDep = { 'Heure de départ': fin.toISOString(), 'Statut': 'Terminée' };
      if (estManuel) champsDep['Observation'] = '[Départ en saisie manuelle — scan impossible]';
      await modifier(T.POINTAGES, mission.id, champsDep);
      await marquerAffectationEffectuee(salarie, mission.date || jour, hotelId);
      return res.json({
        action: 'depart',
        hotel: mission.hotel,
        prestation: mission.prestation,
        duree,
        message: `Départ enregistré — ${duree.toFixed(2).replace('.', ',')} h au ${mission.hotel}. Bonne journée !`,
      });
    }

    // ── Arrivée : déterminer la prestation ──
    let prestaId = prestationId || null;
    if (!prestaId) {
      const affectations = siennes(await lister(T.AFFECTATIONS, {
        formule: `IS_SAME({Date prévue}, '${jour}', 'day')`,
      }), salarie);
      // Une affectation annulée ne fait plus foi : mieux vaut demander la
      // prestation à la salariée que déduire d'une mission qu'on lui a retirée.
      const correspondante = affectations.find(
        (a) => lien(a, 'Hôtel') === hotelId && nomOption(F(a, 'Statut')) !== 'Annulé'
      );
      if (correspondante) prestaId = lien(correspondante, 'Service prévu');
    }

    // La salariée confirme toujours sa prestation : celle du planning est
    // proposée d'avance, mais c'est elle qui sait ce qu'elle va réellement
    // faire, et une prestation fausse est une ligne de facture fausse.
    if (!prestaId) {
      return res.json({
        action: 'choisir-prestation',
        hotelId,
        hotel: F(hotel, 'Nom'),
        prestations: refs.prestations.map((p) => ({ id: p.id, type: F(p, 'Type de prestation') })),
        message: `Aucune mission planifiée ce jour-là au ${F(hotel, 'Nom')}. Quelle prestation vas-tu réaliser ?`,
      });
    }

    const presta = refs.iPrestations[prestaId];
    const champsArrivee = {
      'Salarié': [salarie.id],
      'Hôtel': [hotelId],
      'Prestations': [prestaId],
      'Date': jour,
      "Heure d'arrivée": instant.toISOString(),
      'Statut': 'En cours',
    };
    if (estManuel) champsArrivee['Observation'] = '[Arrivée en saisie manuelle — scan impossible]';
    await creer(T.POINTAGES, champsArrivee);

    res.json({
      action: 'arrivee',
      hotel: F(hotel, 'Nom'),
      prestation: presta ? F(presta, 'Type de prestation') : '—',
      message: `Arrivée enregistrée au ${F(hotel, 'Nom')}. Bonne mission !`,
    });
  } catch (err) { envoyerErreur(res, err); }
}
