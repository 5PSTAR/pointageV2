// GET  /api/admin/pointages?mois=AAAA-MM&salarie=&statut= — liste par salarié
// PATCH /api/admin/pointages { id, arrivee?, depart?, statut?, observation? } — correction manuelle
import { T, lister, modifier, referentiels, lirePointage, envoyerErreur } from '../_lib/airtable.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'PATCH') {
      const { id, arrivee, depart, statut, observation } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id manquant' });
      const trace = `Modifié par admin le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
      const fields = { Observation: `${observation ?? ''} | ${trace}`.replace(/^ \| /, '') };
      if (arrivee) fields["Heure d'arrivée"] = arrivee;
      if (depart) fields['Heure de départ'] = depart;
      if (statut) fields['Statut'] = statut;
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
