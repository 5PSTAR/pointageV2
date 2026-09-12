// GET  /api/admin/pointages?mois=AAAA-MM&salarie=&statut= — liste par salarié
// PATCH /api/admin/pointages { id, arrivee?, depart?, statut?, observation?, hotelId? } — correction manuelle
import { T, lister, modifier, referentiels, lirePointage, F, envoyerErreur } from '../airtable.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'PATCH') {
      const { id, arrivee, depart, statut, observation, hotelId } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id manquant' });
      const trace = `Modifié par admin le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
      const fields = { Observation: `${observation ?? ''} | ${trace}`.replace(/^ \| /, '') };
      if (arrivee) fields["Heure d'arrivée"] = arrivee;
      if (depart) fields['Heure de départ'] = depart;
      if (statut) fields['Statut'] = statut;
      // Rattachement d'un pointage mal associé. Sans hôtel exploitable il reste
      // hors facturation : la prestation a été faite, mais personne ne la paie.
      if (hotelId !== undefined) {
        if (!/^rec[A-Za-z0-9]{14}$/.test(String(hotelId || ''))) {
          return res.status(400).json({ error: 'Hôtel invalide.' });
        }
        const refs = await referentiels();
        const hotel = refs.iHotels[hotelId];
        if (!hotel) return res.status(400).json({ error: 'Hôtel introuvable.' });
        if (!F(hotel, 'Nom')) {
          return res.status(400).json({ error: "Cette fiche hôtel n'a pas de nom : complète-la dans Airtable avant de l'utiliser." });
        }
        fields['Hôtel'] = [hotelId];
      }
      await modifier(T.POINTAGES, id, fields);
      return res.json({ ok: true });
    }

    const mois = req.query.mois || new Date().toISOString().slice(0, 7);
    const conditions = [`DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}'`];
    const refs = await referentiels();
    const pages = await lister(T.POINTAGES, {
      formule: `AND(${conditions.join(',')})`,
      tri: [{ field: "Heure d'arrivée", direction: 'desc' }],
    });
    let pointages = pages.map((p) => lirePointage(p, refs));
    if (req.query.salarie) pointages = pointages.filter((p) => p.salarieId === req.query.salarie);
    if (req.query.statut) pointages = pointages.filter((p) => p.statut === req.query.statut);
    res.json({
      mois,
      pointages,
      salaries: refs.salaries.map((s) => ({ id: s.id, nom: s.fields['Nom'] })),
    });
  } catch (err) { envoyerErreur(res, err); }
}
