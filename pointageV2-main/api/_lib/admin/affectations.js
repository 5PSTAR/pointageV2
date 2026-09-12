// Planification des prestations — table Affectations.
// GET    → liste du mois ?mois=AAAA-MM
// POST   { salarieId, clientId, prestationId, date, heure?, commentaires? }  → création
// POST   { remplacer:true, id, salarieId, commentaires? }                    → remplacement d'intervenant
// PATCH  { id, … }                                                          → modification
// DELETE ?id=recXXX                                                         → suppression
//
// « Effectué » ne se saisit pas ici : c'est le scan de départ qui le pose
// (cf. routes-salarie/scan.js). L'admin ne choisit qu'entre Prévu et Annulé.
import { T, lister, creer, modifier, supprimer, referentiels, F, lien, nomOption, envoyerErreur } from '../airtable.js';

const STATUTS_SAISISSABLES = ['Prévu', 'Annulé'];
const estId = (v) => /^rec[A-Za-z0-9]{14}$/.test(v || '');
const estDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

const erreur = (message, status = 400) => {
  const e = new Error(message); e.status = status; return e;
};

/** « 2026-09-12 » → « 12/09 », pour les commentaires de traçabilité. */
const jourCourt = (iso) => (estDate(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);

/** Heure normalisée : les saisies Airtable traînent parfois une espace (« 08:00 »). */
function heureValide(v) {
  const h = String(v || '').trim();
  if (!h) return null;
  if (!/^\d{1,2}:\d{2}$/.test(h)) throw erreur('Heure prévue invalide (format attendu HH:MM).');
  const [hh, mm] = h.split(':').map(Number);
  if (hh > 23 || mm > 59) throw erreur('Heure prévue invalide (format attendu HH:MM).');
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function lireAffectation(a, refs) {
  const salarie = refs.iSalaries[lien(a, 'Salarié')];
  const client = refs.iHotels[lien(a, 'Hôtel')];
  const presta = refs.iPrestations[lien(a, 'Service prévu')];
  return {
    id: a.id,
    salarieId: lien(a, 'Salarié'),
    salarie: F(salarie, 'Nom') || '—',
    clientId: lien(a, 'Hôtel'),
    client: F(client, 'Nom') || '—',
    prestationId: lien(a, 'Service prévu'),
    prestation: presta ? nomOption(F(presta, 'Type de prestation')) : '—',
    date: F(a, 'Date prévue') || null,
    heure: (F(a, 'Heure prévue') || '').trim() || null,
    statut: nomOption(F(a, 'Statut')) || 'Prévu',
    commentaires: F(a, 'Commentaires') || '',
  };
}

/** Champs Airtable à écrire. Seules les clés fournies sont touchées (création comme modification). */
function construireChamps(corps) {
  const fields = {};
  if (corps.salarieId !== undefined) {
    if (!estId(corps.salarieId)) throw erreur('Salariée requise.');
    fields['Salarié'] = [corps.salarieId];
  }
  if (corps.clientId !== undefined) {
    if (!estId(corps.clientId)) throw erreur('Client requis.');
    fields['Hôtel'] = [corps.clientId];
  }
  if (corps.prestationId !== undefined) {
    if (!estId(corps.prestationId)) throw erreur('Prestation requise.');
    fields['Service prévu'] = [corps.prestationId];
  }
  if (corps.date !== undefined) {
    if (!estDate(corps.date)) throw erreur('Date prévue requise (AAAA-MM-JJ).');
    fields['Date prévue'] = corps.date;
  }
  if (corps.heure !== undefined) fields['Heure prévue'] = heureValide(corps.heure) || '';
  if (corps.statut !== undefined) {
    if (!STATUTS_SAISISSABLES.includes(corps.statut)) throw erreur('Statut invalide.');
    fields['Statut'] = corps.statut;
  }
  if (corps.commentaires !== undefined) fields['Commentaires'] = String(corps.commentaires || '');
  return fields;
}

/** Ajoute une ligne à un commentaire existant sans l'écraser. */
const completerCommentaire = (actuel, ajout) => [String(actuel || '').trim(), ajout].filter(Boolean).join('\n');

/**
 * Remplacement d'intervenant : l'affectation d'origine est annulée plutôt que
 * réécrite, et une nouvelle est créée pour la remplaçante. On garde ainsi la
 * trace que la première était prévue et n'a pas assuré — utile en cas de litige.
 */
async function remplacer(corps) {
  const { id, salarieId } = corps;
  if (!estId(id)) throw erreur('Affectation introuvable.');
  if (!estId(salarieId)) throw erreur('Remplaçante requise.');

  const [origine] = await lister(T.AFFECTATIONS, { formule: `RECORD_ID() = '${id}'` });
  if (!origine) throw erreur('Affectation introuvable.', 404);
  if (lien(origine, 'Salarié') === salarieId) throw erreur('La remplaçante est déjà l’intervenante prévue.');

  const refs = await referentiels();
  const date = F(origine, 'Date prévue');
  const sortante = refs.iSalaries[lien(origine, 'Salarié')];
  const entrante = refs.iSalaries[salarieId];
  const nomSortante = F(sortante, 'Nom') || 'l’intervenante prévue';
  const nomEntrante = F(entrante, 'Nom') || 'une remplaçante';

  await modifier(T.AFFECTATIONS, id, {
    'Statut': 'Annulé',
    'Commentaires': completerCommentaire(
      F(origine, 'Commentaires'),
      `Annulée — remplacée par ${nomEntrante}${date ? ` le ${jourCourt(date)}` : ''}.`,
    ),
  });

  const cree = await creer(T.AFFECTATIONS, {
    'Salarié': [salarieId],
    'Hôtel': [lien(origine, 'Hôtel')],
    'Service prévu': [lien(origine, 'Service prévu')],
    'Date prévue': date,
    'Heure prévue': (F(origine, 'Heure prévue') || '').trim(),
    'Statut': 'Prévu',
    'Commentaires': completerCommentaire(corps.commentaires, `Remplace ${nomSortante}.`),
  });

  return { ok: true, id: cree.id, remplacee: nomSortante, remplacante: nomEntrante };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : null;
      const refs = await referentiels();
      const recs = await lister(T.AFFECTATIONS, {
        formule: mois ? `DATETIME_FORMAT({Date prévue}, 'YYYY-MM') = '${mois}'` : undefined,
      });
      return res.json({ affectations: recs.map((a) => lireAffectation(a, refs)) });
    }

    if (req.method === 'POST') {
      if (req.body?.remplacer) return res.json(await remplacer(req.body));
      const corps = req.body || {};
      // Une affectation sans salariée, sans client, sans prestation ou sans date
      // ne veut rien dire : on l'exige à la création (contrairement au PATCH,
      // qui ne touche que les champs fournis).
      const manquant = ['salarieId', 'clientId', 'prestationId', 'date']
        .find((cle) => corps[cle] === undefined || corps[cle] === null || corps[cle] === '');
      if (manquant) throw erreur('Salariée, client, prestation et date sont obligatoires.');
      const fields = construireChamps(corps);
      if (!fields['Statut']) fields['Statut'] = 'Prévu';
      const cree = await creer(T.AFFECTATIONS, fields);
      return res.json({ ok: true, id: cree.id });
    }

    if (req.method === 'PATCH') {
      const { id } = req.body || {};
      if (!estId(id)) throw erreur('Identifiant invalide.');
      const fields = construireChamps(req.body || {});
      if (Object.keys(fields).length) await modifier(T.AFFECTATIONS, id, fields);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (!estId(req.query.id)) throw erreur('Identifiant invalide.');
      await supprimer(T.AFFECTATIONS, req.query.id);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) { envoyerErreur(res, err); }
}
