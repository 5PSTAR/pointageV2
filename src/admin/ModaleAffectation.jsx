import { useState } from 'react';

// Planification d'une prestation. Trois usages, un seul formulaire :
//   creer      — nouvelle affectation, la date venant de la case cliquée
//   modifier   — correction d'une affectation existante
//   remplacer  — l'intervenante prévue est indisponible : on désigne sa
//                remplaçante, l'ancienne affectation est annulée (traçabilité)
//
// « Effectué » ne figure pas dans les statuts : il est posé par le scan de
// départ, pas à la main — sinon deux vérités pourraient se contredire.
const STATUTS = ['Prévu', 'Annulé'];

const dateLongue = (iso) => (iso
  ? new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  : '');

export default function ModaleAffectation({ mode, initial, refs, fermer, valider, supprimer, envoi, erreur }) {
  // Une prestation déjà pointée est « Effectué » : ce statut vient du terrain,
  // on ne le propose pas à la modification — le laisser dans le formulaire le
  // ferait retomber à « Prévu » au premier enregistrement.
  const dejaEffectuee = initial?.statut === 'Effectué';
  const [f, setF] = useState({
    salarieId: initial?.salarieId || '',
    clientId: initial?.clientId || '',
    prestationId: initial?.prestationId || '',
    date: initial?.date || '',
    heure: initial?.heurePrevue || '',
    // undefined : la clé disparaît du JSON, le statut d'origine reste intact.
    statut: dejaEffectuee ? undefined : initial?.statut === 'Annulé' ? 'Annulé' : 'Prévu',
    commentaires: initial?.commentaires || '',
  });
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const remplacement = mode === 'remplacer';
  const titre = remplacement ? 'Remplacer l’intervenante'
    : mode === 'modifier' ? 'Modifier la prestation'
    : 'Planifier une prestation';

  // En remplacement, seule la remplaçante se choisit : le reste (client,
  // prestation, date) est repris à l'identique de l'affectation d'origine.
  const salariesDisponibles = (refs?.salaries || [])
    .filter((s) => !remplacement || s.id !== initial?.salarieId);

  const complet = remplacement
    ? Boolean(f.salarieId)
    : Boolean(f.salarieId && f.clientId && f.prestationId && f.date);

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale" style={{ maxWidth: 480 }}>
        <h2>{titre}</h2>
        <p className="muted petit" style={{ marginBottom: 18 }}>
          {remplacement
            ? `${initial?.salarie} — ${initial?.hotel} · ${dateLongue(initial?.date)}. Son affectation sera annulée et conservée dans l’historique.`
            : f.date ? dateLongue(f.date) : 'Choisissez une date'}
        </p>

        <div className="champ"><label>{remplacement ? 'Remplaçante' : 'Salariée'}</label>
          <select value={f.salarieId} onChange={maj('salarieId')}>
            <option value="">Choisir…</option>
            {salariesDisponibles.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </div>

        {!remplacement && (
          <>
            <div className="champ"><label>Client</label>
              <select value={f.clientId} onChange={maj('clientId')}>
                <option value="">Choisir…</option>
                {(refs?.hotels || []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div className="champ"><label>Prestation</label>
              <select value={f.prestationId} onChange={maj('prestationId')}>
                <option value="">Choisir…</option>
                {(refs?.prestations || []).map((p) => <option key={p.id} value={p.id}>{p.type}</option>)}
              </select>
            </div>
            <div className="deux-colonnes">
              <div className="champ"><label>Date</label>
                <input type="date" value={f.date} onChange={maj('date')} />
              </div>
              <div className="champ"><label>Heure prévue</label>
                <input type="time" value={f.heure} onChange={maj('heure')} />
              </div>
            </div>
            {dejaEffectuee ? (
              <p className="muted petit" style={{ marginBottom: 14 }}>
                Prestation déjà pointée — son statut « Effectué » vient du scan et reste inchangé.
              </p>
            ) : (
              <div className="champ"><label>Statut</label>
                <select value={f.statut} onChange={maj('statut')}>
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <div className="champ"><label>Commentaires (facultatif)</label>
          <input value={f.commentaires} onChange={maj('commentaires')}
                 placeholder={remplacement ? 'Motif de l’indisponibilité…' : 'Consignes, accès, précisions…'} />
        </div>

        {erreur && <div className="bandeau erreur">{erreur}</div>}

        <div className="pied-modale">
          {mode === 'modifier' && (
            <button className="btn rouge" onClick={supprimer} disabled={envoi}
                    style={{ marginRight: 'auto' }}>Supprimer</button>
          )}
          <button className="btn" onClick={fermer}>Annuler</button>
          <button className="btn bleu" onClick={() => valider(f)} disabled={envoi || !complet}>
            {envoi ? 'Enregistrement…'
              : remplacement ? 'Confirmer le remplacement'
              : mode === 'modifier' ? 'Enregistrer' : 'Planifier'}
          </button>
        </div>
      </div>
    </div>
  );
}
