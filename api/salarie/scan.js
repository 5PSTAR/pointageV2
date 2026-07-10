// POST /api/salarie/scan { contenu: "PTG:recXXXX", prestationId? }
// Arrivée si aucune mission en cours, sinon Départ.
// La prestation est déduite de l'affectation du jour ; à défaut, le client doit en choisir une.
import { T, lister, creer, modifier, referentiels, lirePointage, F, lien, aujourdhuiParis, echapper, envoyerErreur } from '../_lib/airtable.js';
import { exigerSalarie } from '../_lib/salarie.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const { contenu, prestationId } = req.body || {};
    const brut = String(contenu || '').trim();
    const m = brut.match(/^PTG:(rec[A-Za-z0-9]{14})$/) || brut.match(/\/q\/(rec[A-Za-z0-9]{14})(?:[/?#]|$)/);
    if (!m) return res.status(400).json({ error: "Ce QR code n'est pas un QR code 5P STAR." });
    const hotelId = m[1];

    const refs = await referentiels();
    const hotel = refs.iHotels[hotelId];
    if (!hotel) return res.status(404).json({ error: 'Hôtel inconnu. Préviens ton responsable.' });

    const nom = echapper(F(salarie, 'Nom') || '');
    const auj = aujourdhuiParis();
    const maintenant = new Date().toISOString();

    // ── Une mission est-elle déjà ouverte ? ──
    const ouverts = (await lister(T.POINTAGES, {
      formule: `AND({Salarié} = '${nom}', {Statut} = 'En cours')`,
    })).map((p) => lirePointage(p, refs));

    if (ouverts.length) {
      const mission = ouverts[0];
      if (mission.hotelId !== hotelId) {
        return res.status(409).json({
          error: `Tu as une mission ouverte au ${mission.hotel}. Scanne d'abord le QR de cet hôtel pour la clôturer.`,
        });
      }
      const duree = Math.round(((new Date(maintenant) - new Date(mission.arrivee)) / 3_600_000) * 100) / 100;
      await modifier(T.POINTAGES, mission.id, { 'Heure de départ': maintenant, 'Statut': 'Terminée' });
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
      const affectations = await lister(T.AFFECTATIONS, {
        formule: `AND({Salarié} = '${nom}', IS_SAME({Date prévue}, '${auj}', 'day'))`,
      });
      const correspondante = affectations.find((a) => lien(a, 'Hôtel') === hotelId);
      if (correspondante) prestaId = lien(correspondante, 'Service prévu');
    }

    if (!prestaId) {
      // Aucune affectation : on demande à la salariée de choisir
      return res.status(200).json({
        action: 'choisir-prestation',
        hotelId,
        hotel: F(hotel, 'Nom'),
        prestations: refs.prestations.map((p) => ({ id: p.id, type: F(p, 'Type de prestation') })),
        message: `Aucune mission planifiée aujourd'hui au ${F(hotel, 'Nom')}. Quelle prestation vas-tu réaliser ?`,
      });
    }

    const presta = refs.iPrestations[prestaId];
    await creer(T.POINTAGES, {
      'Salarié': [salarie.id],
      'Hôtel': [hotelId],
      'Prestations': [prestaId],
      'Date': auj,
      "Heure d'arrivée": maintenant,
      'Statut': 'En cours',
    });

    res.json({
      action: 'arrivee',
      hotel: F(hotel, 'Nom'),
      prestation: presta ? F(presta, 'Type de prestation') : '—',
      message: `Arrivée enregistrée au ${F(hotel, 'Nom')}. Bonne mission !`,
    });
  } catch (err) { envoyerErreur(res, err); }
}
