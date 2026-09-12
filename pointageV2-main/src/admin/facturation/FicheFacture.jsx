import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import {
  libelleStatut, chipStatut, eur, dateFr, periodeFr, lienExport,
} from './statuts.js';

// Reprend l'habillage « facture papier » déjà en place dans l'application,
// enrichi du suivi : statut, dates, règlement, historique des relances.
export default function FicheFacture({ facture, onRetour, onAction }) {
  // L'historique arrive déjà avec la facture ; on ne rappelle le serveur que
  // si la liste n'a pas été fournie.
  const [relances, setRelances] = useState(facture.relances || []);
  // Les pointages d'origine, eux, se chargent à l'ouverture de la fiche :
  // trop lourds pour accompagner chaque ligne de la liste.
  const [pointages, setPointages] = useState([]);
  const [depliees, setDepliees] = useState(new Set());

  useEffect(() => {
    if (!facture.id) { setPointages([]); return; }
    api(`/api/admin/factures?facture=${facture.id}`)
      .then((d) => setPointages(d.pointages || [])).catch(() => setPointages([]));
  }, [facture.id]);

  useEffect(() => {
    if (facture.relances) { setRelances(facture.relances); return; }
    if (!facture.id) { setRelances([]); return; }
    api(`/api/admin/relances?facture=${facture.id}`)
      .then((d) => setRelances(d.relances)).catch(() => setRelances([]));
  }, [facture.id, facture.relances]);

  const totalHeures = facture.lignes.reduce((s, l) => s + (l.heures || 0), 0);

  const cle = (l) => `${l.date || ''}|${l.prestation}`;
  const parLigne = new Map();
  for (const p of pointages) {
    const k = cle(p);
    if (!parLigne.has(k)) parLigne.set(k, []);
    parLigne.get(k).push(p);
  }
  // Les factures émises avant le détail journalier n'ont pas de date sur
  // leurs lignes : on retombe alors sur la prestation seule.
  const pointagesDe = (l) => parLigne.get(cle(l)) || (l.date ? [] : pointages.filter((p) => p.prestation === l.prestation));
  const basculer = (k) => setDepliees((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const toutDeplier = () => setDepliees(new Set(facture.lignes.map(cle)));
  const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <>
      <div className="entete-page" style={{ marginBottom: 14 }}>
        <button className="btn mini" onClick={onRetour}>← Retour à la liste</button>
        <span className={`chip ${chipStatut(facture.statut)}`}>{libelleStatut(facture.statut)}</span>
      </div>

      <div className="facture-hero">
        <div className="en-tete">
          <div>
            <div className="num-label">Facture</div>
            <div className="num mono">{facture.numero || '— non générée —'}</div>
            <div className="periode">Période · {periodeFr(facture.mois)}</div>
          </div>
          <div className="prestataire">
            <div className="num-label">Prestataire</div>
            <div className="nomp">5P STAR — Ménage hôtelier</div>
            <div className="email">5pstar@5pstar.com</div>
          </div>
        </div>

        <div className="facture-a">
          <div className="num-label">Facturé à</div>
          <div className="nom-hotel">{facture.hotel}</div>
          <div className="adresse">
            {facture.adresse}
            {facture.categorie ? <><br />Catégorie · {facture.categorie}</> : null}
            {facture.codeClient ? <><br />Code client · {facture.codeClient}</> : null}
            {facture.emailFacturation
              ? <><br />{facture.emailFacturation}</>
              : <><br /><span style={{ color: 'var(--orange)' }}>Aucune adresse de facturation</span></>}
          </div>
        </div>

        {pointages.length > 0 && (
          <div style={{ padding: '10px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn mini" onClick={() => (depliees.size ? setDepliees(new Set()) : toutDeplier())}>
              {depliees.size ? 'Tout replier' : 'Voir qui est intervenu'}
            </button>
          </div>
        )}
        <div className="defile">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Prestation</th><th className="num">Interv.</th><th className="num">Heures</th>
                <th className="num">Tarif</th><th className="num">Montant HT</th><th>Pointages</th>
              </tr>
            </thead>
            <tbody>
              {facture.lignes.map((l, i) => {
                const lot = pointagesDe(l);
                const ouverte = depliees.has(cle(l));
                return (
                <React.Fragment key={i}>
                <tr className={lot.length ? 'ligne-depliable' : ''}
                    onClick={() => lot.length && basculer(cle(l))}>
                  <td className="mono muted">{l.date ? dateFr(l.date) : '—'}</td>
                  <td>
                    <div className="principal">
                      {lot.length > 0 && <span className="chevron">{ouverte ? '▾' : '▸'}</span>}
                      {l.prestation}
                    </div>
                  </td>
                  <td className="num mono">
                    {(l.intervenants || 1) > 1
                      ? <span className="chip bleu">×{l.intervenants}</span>
                      : <span className="muted">1</span>}
                  </td>
                  <td className="num mono">{(l.heures ?? 0).toFixed(2)}</td>
                  <td className="num muted">{l.tarif == null ? <span className="chip orange">manquant</span> : eur(l.tarif)}</td>
                  <td className="num mono montant">{l.montant == null ? '—' : eur(l.montant)}</td>
                  {/* Renvoi vers les pointages d'origine, pour remonter à la source. */}
                  <td className="mono secondaire">{(l.references || []).join(' ') || '—'}</td>
                </tr>
                {ouverte && lot.map((p) => (
                  <tr className="sous-ligne" key={p.id}>
                    {/* La date du pointage lui-même : les factures émises avant
                        le détail journalier n'en portent pas sur leur ligne. */}
                    <td className="mono muted">{dateFr(p.date)}</td>
                    <td><span className="fleche">↳</span> <strong>{p.salarie}</strong></td>
                    <td className="num">
                      {p.statut !== 'Terminée' && <span className="chip orange">{p.statut}</span>}
                    </td>
                    <td className="num mono">{(p.duree ?? 0).toFixed(2)}</td>
                    <td className="num mono muted">{heure(p.arrivee)} → {heure(p.depart)}</td>
                    <td className="num muted petit">{p.observation ? p.observation.slice(0, 40) : ''}</td>
                    <td className="mono secondaire">#{p.numero}</td>
                  </tr>
                ))}
                </React.Fragment>
                );
              })}
              <tr className="total-ligne">
                <td colSpan="3"><strong>TOTAL HT</strong></td>
                <td className="num mono total">{totalHeures.toFixed(2)} h</td>
                <td></td>
                <td className="num mono montant" style={{ fontSize: 15 }}>{eur(facture.totalHT)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="profil-triple" style={{ borderTop: '1px solid var(--bord)' }}>
          <div className="bloc">
            <div className="num-label">TVA {((facture.tauxTVA ?? 0.2) * 100).toFixed(0)} %</div>
            <div className="gros violet mono">{eur(facture.totalTVA)}</div>
            <div className="infra">Total TTC · {eur(facture.totalTTC)}</div>
          </div>
          <div className="bloc">
            <div className="num-label">Dates</div>
            <div className="infra" style={{ marginTop: 4 }}>Émission · {dateFr(facture.dateEmission)}</div>
            <div className="infra">Envoi · {dateFr(facture.dateEnvoi)}</div>
            <div className="infra">Échéance · {dateFr(facture.dateEcheance)}</div>
          </div>
          <div className="bloc">
            <div className="num-label">Règlement</div>
            {facture.datePaiement ? (
              <>
                <div className="gros vert mono">{eur(facture.montantRegle ?? facture.totalTTC)}</div>
                <div className="infra">
                  {dateFr(facture.datePaiement)}
                  {facture.modeReglement ? ` · ${facture.modeReglement}` : ''}
                  {facture.referencePaiement ? ` · ${facture.referencePaiement}` : ''}
                </div>
              </>
            ) : (
              <>
                <div className="infra" style={{ marginTop: 4 }}>Non réglée</div>
                {facture.joursRetard != null && (
                  <div className="infra" style={{ color: 'var(--orange)' }}>{facture.joursRetard} jours de retard</div>
                )}
              </>
            )}
          </div>
        </div>

        {relances.length > 0 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--bord)' }}>
            <div className="num-label" style={{ marginBottom: 8 }}>Historique des relances</div>
            {relances.map((r) => (
              <div className="item" key={r.id} style={{ display: 'flex', gap: 12, fontSize: 12.5, padding: '5px 0', color: 'var(--txt2)' }}>
                <span className="mono">{dateFr(r.date)}</span>
                <span>{r.niveau}</span>
                <span className="muted">{r.statut === 'Envoyée' ? 'envoyée par email' : String(r.statut || '').toLowerCase()} à {r.destinataire || '—'}</span>
                <span className={`chip ${r.statut === 'Envoyée' ? 'vert' : 'gris'}`}>{r.statut}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 24px 20px', borderTop: '1px solid var(--bord)' }}>
          {facture.id && <a className="btn bleu" href={lienExport(facture, 'pdf')}>Voir le PDF</a>}
          {facture.id && <a className="btn" href={lienExport(facture, 'xlsx')}>Excel</a>}
          {facture.statut !== 'payee' && facture.statut !== 'annulee' && facture.id && (
            <button className="btn" onClick={() => onAction('envoyer', facture)}>Envoyer la facture</button>
          )}
          {facture.statut === 'en_retard' && (
            <button className="btn orange" onClick={() => onAction('relancer', facture)}>Relancer</button>
          )}
          {facture.statut !== 'payee' && facture.id && (
            <button className="btn vert" onClick={() => onAction('payer', facture)}>Marquer comme payée</button>
          )}
          {facture.statut === 'payee' && (
            <button className="btn" onClick={() => onAction('annuler-paiement', facture)}>Annuler le paiement</button>
          )}
          {facture.id && facture.statut !== 'annulee' && facture.statut !== 'payee' && (
            <button className="btn rouge" style={{ marginLeft: 'auto' }} onClick={() => onAction('annuler', facture)}>
              Annuler la facture
            </button>
          )}
        </div>
      </div>
    </>
  );
}
