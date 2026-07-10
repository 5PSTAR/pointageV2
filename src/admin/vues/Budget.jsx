import { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function Budget() {
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [salarie, setSalarie] = useState('');
  const [data, setData] = useState(null);
  const [detailSalarie, setDetailSalarie] = useState(null);
  const [refs, setRefs] = useState(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [chargement, setChargement] = useState(false);

  useEffect(() => { api('/api/admin/referentiels').then(setRefs).catch(() => {}); }, []);

  useEffect(() => {
    setChargement(true); setErreur(''); setInfo(''); setData(null);
    api(`/api/admin/budget?mois=${mois}`)
      .then(setData).catch((e) => setErreur(e.message)).finally(() => setChargement(false));
  }, [mois]);

  useEffect(() => {
    setDetailSalarie(null);
    if (!salarie) return;
    api(`/api/admin/pointages?mois=${mois}&salarie=${salarie}`)
      .then((d) => setDetailSalarie(d.pointages.filter((p) => p.statut === 'Terminée')))
      .catch(() => setDetailSalarie([]));
  }, [salarie, mois]);

  async function enregistrer() {
    setChargement(true); setErreur('');
    try {
      const r = await api('/api/admin/budget', { method: 'POST', body: { mois } });
      setInfo(`${r.lignes} ligne(s) enregistrée(s) dans « Facturation Salariés » — total ${r.total.toFixed(2)} €.`);
    } catch (e) { setErreur(e.message); }
    setChargement(false);
  }

  const ligneChoisie = data?.lignes.find((l) => l.salarieId === salarie);
  const profil = refs?.salaries.find((s) => s.id === salarie);
  const fmtH = (h) => {
    const hh = Math.floor(h); const mm = Math.round((h - hh) * 60);
    return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
  };
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <>
      <div className="entete-page"><h1>Suivi budgétaire salariés</h1></div>
      <div className="carte" style={{ marginBottom: 14 }}>
        <div className="filtres" style={{ marginBottom: 0 }}>
          <div className="champ"><label>Salariée</label>
            <select value={salarie} onChange={(e) => setSalarie(e.target.value)}>
              <option value="">Toutes (consolidé)</option>
              {(data?.lignes || []).map((l) => <option key={l.salarieId} value={l.salarieId}>{l.salarie}</option>)}
            </select>
          </div>
          <div className="champ"><label>Mois</label><input type="month" value={mois} onChange={(e) => setMois(e.target.value)} /></div>
          <div className="pousse">
            <a className="btn" href={`/api/admin/budget?mois=${mois}&format=xlsx`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Export CSV
            </a>
            <a className="btn bleu" href={`/api/admin/budget?mois=${mois}&format=pdf`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
              PDF
            </a>
          </div>
        </div>
      </div>
      {erreur && <div className="bandeau erreur">{erreur}</div>}
      {info && <div className="bandeau ok">{info}</div>}
      {chargement && <p className="muted">Calcul…</p>}

      {/* ── Vue par salariée : triple carte (design validé) ── */}
      {data && salarie && ligneChoisie && (
        <div className="facture-hero">
          <div className="profil-triple">
            <div className="bloc">
              <div className="num-label">Salariée</div>
              <div className="nom-salarie">{ligneChoisie.salarie}</div>
              <div className="contact">{ligneChoisie.taux ? `${ligneChoisie.taux.toFixed(1).replace('.', ',')} €/h` : 'taux manquant'}</div>
              {profil?.telephone && <div className="tel">📞 {profil.telephone}</div>}
            </div>
            <div className="bloc">
              <div className="num-label">Heures totales</div>
              <div className="gros violet mono">{fmtH(ligneChoisie.heures)}</div>
              <div className="infra">{ligneChoisie.interventions} prestation(s)</div>
            </div>
            <div className="bloc">
              <div className="num-label">Coût total</div>
              <div className="gros vert mono">{ligneChoisie.cout.toFixed(2)} €</div>
              <div className="infra">à {ligneChoisie.taux} €/h brut</div>
            </div>
          </div>
          <div className="defile">
            <table>
              <thead><tr><th>Date</th><th>Hôtel</th><th>Prestation</th><th className="num">Arrivée</th><th className="num">Départ</th><th className="num">Heures</th><th className="num">Coût</th></tr></thead>
              <tbody>
                {(detailSalarie || []).map((p) => (
                  <tr key={p.id}>
                    <td className="mono muted">{p.date ? new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td><div className="principal">{p.hotel}</div></td>
                    <td>{p.prestation}</td>
                    <td className="num mono arrivee">{heure(p.arrivee)}</td>
                    <td className="num mono depart">{heure(p.depart)}</td>
                    <td className="num mono">{p.duree}</td>
                    <td className="num mono cout">{((p.duree || 0) * (p.tauxHoraireSalarie || 0)).toFixed(2)} €</td>
                  </tr>
                ))}
                <tr className="total-ligne">
                  <td colSpan="5"><strong>Total</strong></td>
                  <td className="num mono total">{fmtH(ligneChoisie.heures)}</td>
                  <td className="num mono cout" style={{ fontSize: 15 }}>{ligneChoisie.cout.toFixed(2)} €</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Vue consolidée : toutes les salariées ── */}
      {data && !salarie && (
        <div className="carte defile" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Salariée</th><th className="num">Interventions</th><th className="num">Heures</th><th className="num">Taux horaire</th><th className="num">Coût</th><th>Détail prestations</th></tr></thead>
            <tbody>
              {data.lignes.map((l) => (
                <tr key={l.salarieId}>
                  <td><div className="principal">{l.salarie}</div></td>
                  <td className="num mono">{l.interventions}</td>
                  <td className="num mono">{l.heures}</td>
                  <td className="num muted">{l.taux ? `${l.taux.toFixed(2)} €` : <span className="chip orange">manquant</span>}</td>
                  <td className="num mono cout">{l.cout.toFixed(2)} €</td>
                  <td className="secondaire">{l.prestations}</td>
                </tr>
              ))}
              <tr className="total-ligne">
                <td><strong>TOTAL CONSOLIDÉ</strong></td>
                <td></td>
                <td className="num mono total">{data.totalHeures} h</td>
                <td></td>
                <td className="num mono cout" style={{ fontSize: 15 }}>{data.total.toFixed(2)} €</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          {data.tauxManquant && (
            <div className="bandeau erreur" style={{ margin: 16 }}>
              Un taux horaire est manquant — complétez « Taux Horaire » dans la table Salariés.
            </div>
          )}
          <div style={{ padding: '4px 16px 16px' }}>
            <button className="btn orange" onClick={enregistrer} disabled={chargement || !data.lignes.length}>
              💾 Enregistrer dans « Facturation Salariés »
            </button>
          </div>
        </div>
      )}
    </>
  );
}
