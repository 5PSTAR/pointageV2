// POST /api/salarie/regulariser { pointageId, heure: "HH:MM" }
// Clôture une mission restée ouverte, à l'heure que la salariée déclare.
// Sans cela un départ oublié reste « En cours » indéfiniment : ni payé, ni
// facturé. La saisie est tracée dans l'Observation pour que l'admin la voie.
import { T, lire, modifier, referentiels, lirePointage, instantParis, envoyerErreur } from '../airtable.js';
import { exigerSalarie } from '../salarie.js';

// Une journée de ménage ne dépasse pas douze heures ; au-delà, c'est une
// erreur de saisie qu'il vaut mieux faire trancher par le responsable.
const DUREE_MAX_H = 12;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const salarie = await exigerSalarie(req, res);
    if (!salarie) return;

    const { pointageId, heure } = req.body || {};
    if (!/^rec[A-Za-z0-9]{14}$/.test(String(pointageId || ''))) {
      return res.status(400).json({ error: 'Pointage introuvable.' });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(heure || ''))) {
      return res.status(400).json({ error: 'Indique une heure au format 17:30.' });
    }

    const refs = await referentiels();
    const brut = await lire(T.POINTAGES, pointageId);
    const mission = lirePointage(brut, refs);

    if (mission.salarieId !== salarie.id) return res.status(403).json({ error: "Ce pointage n'est pas le tien." });
    if (mission.statut !== 'En cours') return res.status(409).json({ error: 'Cette mission est déjà clôturée.' });
    if (!mission.arrivee) return res.status(409).json({ error: 'Cette mission n\'a pas d\'heure d\'arrivée. Préviens ton responsable.' });

    // L'heure déclarée se rapporte au jour de l'arrivée : une mission commencée
    // à 22 h et close à 01 h se termine le lendemain.
    const arrivee = new Date(mission.arrivee);
    const jour = mission.date || mission.arrivee.slice(0, 10);
    let fin = instantParis(jour, heure);
    if (fin <= arrivee) fin = new Date(fin.getTime() + 24 * 3_600_000);

    const duree = Math.round(((fin - arrivee) / 3_600_000) * 100) / 100;
    if (duree > DUREE_MAX_H) {
      return res.status(400).json({ error: `Cela ferait ${duree.toFixed(2).replace('.', ',')} h de mission. Vérifie l'heure, ou préviens ton responsable.` });
    }
    if (fin > new Date()) return res.status(400).json({ error: "Cette heure n'est pas encore passée." });

    const trace = `[Départ régularisé par la salariée le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}]`;
    await modifier(T.POINTAGES, mission.id, {
      'Heure de départ': fin.toISOString(),
      'Statut': 'Terminée',
      'Observation': mission.observation ? `${mission.observation}\n${trace}` : trace,
    });

    res.json({
      ok: true,
      duree,
      message: `Départ enregistré à ${heure} — ${duree.toFixed(2).replace('.', ',')} h au ${mission.hotel}.`,
    });
  } catch (err) { envoyerErreur(res, err); }
}
