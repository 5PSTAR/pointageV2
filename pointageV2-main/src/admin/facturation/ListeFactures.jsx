import { useEffect, useRef, useState } from 'react';
import {
  libelleStatut, chipStatut, actionsPossibles, LIBELLES_ACTIONS,
  eur, dateFr, periodeFr, lienExport,
} from './statuts.js';

// Motif qui empêche d'émettre. Le serveur le nomme ; on retombe sur l'ancien
// libellé tarifaire pour les réponses d'une version antérieure.
const motifBloquant = (f) => f.bloquant
  || (f.tarifManquant ? (f.categorie ? 'tarif manquant pour cette catégorie' : 'hôtel sans catégorie') : null);

/** Menu « … » : n'affiche que ce qui a du sens pour l'état de la ligne. */
function MenuLigne({ facture, onAction }) {
  // Position fixe plutôt qu'absolue : le tableau défile horizontalement, un
  // menu positionné dans le flux serait rogné par son conteneur.
  const [pos, setPos] = useState(null);
  const boite = useRef(null);
  useEffect(() => {
    if (!pos) return;
    const fermer = (e) => { if (boite.current && !boite.current.contains(e.target)) setPos(null); };
    const auDefilement = () => setPos(null);
    document.addEventListener('mousedown', fermer);
    window.addEventListener('scroll', auDefilement, true);
    return () => {
      document.removeEventListener('mousedown', fermer);
      window.removeEventListener('scroll', auDefilement, true);
    };
  }, [pos]);

  function basculer(e) {
    if (pos) return setPos(null);
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 5, left: Math.max(8, Math.min(r.right - 210, window.innerWidth - 222)) });
  }

  const setOuvert = () => setPos(null);
  const actions = actionsPossibles(facture);
  return (
    <span ref={boite}>
      <button className="btn-points" onClick={basculer} aria-label="Autres actions" aria-expanded={Boolean(pos)}>…</button>
      {pos && (
        <div className="menu-flottant" role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
          {actions.map((a) => {
            if (a === 'pdf' || a === 'excel') {
              return (
                <a key={a} href={lienExport(facture, a === 'pdf' ? 'pdf' : 'xlsx')} onClick={() => setOuvert(false)}>
                  {LIBELLES_ACTIONS[a]}
                </a>
              );
            }
            return (
              <button
                key={a}
                className={a === 'annuler' ? 'danger' : ''}
                onClick={() => { setOuvert(false); onAction(a, facture); }}
              >
                {LIBELLES_ACTIONS[a]}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

/** Une ligne à facturer est identifiée par son hôtel ET son mois. */
const cleLigne = (l) => `${l.hotelId}|${l.mois}`;

export default function ListeFactures({ lignes, envoi, selection, setSelection, onOuvrir, onAction }) {
  const generables = lignes.filter((l) => l.statut === 'a_facturer' && !motifBloquant(l));
  const basculer = (cle) => setSelection(selection.includes(cle)
    ? selection.filter((x) => x !== cle)
    : [...selection, cle]);

  if (!lignes.length) {
    return <div className="carte" style={{ textAlign: 'center', padding: 36 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Aucune facture sur cette période</p>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        Les hôtels apparaissent ici dès qu'ils ont des pointages terminés sur le mois choisi.
      </p>
    </div>;
  }

  return (
    <>
      {selection.length > 0 && (
        <div className="bandeau ok" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{selection.length} hôtel(s) sélectionné(s)</span>
          <button className="btn mini bleu" disabled={envoi} onClick={() => onAction('generer-selection', null)}>
            Générer ces factures
          </button>
          <button className="btn mini" onClick={() => setSelection([])}>Tout désélectionner</button>
        </div>
      )}

      <div className="carte defile" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  checked={generables.length > 0 && selection.length === generables.length}
                  disabled={!generables.length}
                  onChange={(e) => setSelection(e.target.checked ? generables.map(cleLigne) : [])}
                />
              </th>
              <th>Hôtel</th>
              <th>Période</th>
              <th className="num">Montant HT</th>
              <th>N° de facture</th>
              <th>Envoi</th>
              <th>Échéance</th>
              <th>Statut</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((f) => (
              <tr key={f.id || f.hotelId}>
                <td>
                  {f.statut === 'a_facturer' && !motifBloquant(f) && (
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${f.hotel}`}
                      checked={selection.includes(cleLigne(f))}
                      onChange={() => basculer(cleLigne(f))}
                    />
                  )}
                </td>
                <td>
                  <div className="principal">{f.hotel}</div>
                  {f.categorie && <div className="secondaire">{f.categorie}</div>}
                  {motifBloquant(f) && (
                    <div className="secondaire" style={{ color: 'var(--orange)' }}>{motifBloquant(f)}</div>
                  )}
                </td>
                <td className="secondaire">{periodeFr(f.mois)}</td>
                <td className="num mono">{motifBloquant(f) ? '—' : eur(f.totalHT)}</td>
                <td className="mono secondaire">{f.numero || '—'}</td>
                <td className="mono secondaire">{dateFr(f.dateEnvoi)}</td>
                <td className="mono secondaire">{dateFr(f.dateEcheance)}</td>
                <td>
                  <span className={`chip ${chipStatut(f.statut)}`}>{libelleStatut(f.statut)}</span>
                  {f.joursRetard != null && (
                    <div className="secondaire" style={{ marginTop: 3 }}>{f.joursRetard} j</div>
                  )}
                </td>
                <td>
                  <div className="cellule-actions">
                    {f.statut === 'a_facturer' ? (
                      <button
                        className="btn mini bleu"
                        disabled={envoi || Boolean(motifBloquant(f))}
                        title={motifBloquant(f) || ''}
                        onClick={() => onAction('generer', f)}
                      >
                        Générer
                      </button>
                    ) : (
                      <button className="btn mini" onClick={() => onOuvrir(f)}>Voir</button>
                    )}
                    <MenuLigne facture={f} onAction={onAction} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
