import { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function Pointages() {
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [salarie, setSalarie] = useState('');
  const [statut, setStatut] = useState('');
  const [data, setData] = useState(null);
  const [edition, setEdition] = useState(null);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = () => {
    setData(null); setErreur('');
    const p = new URLSearchParams({ mois });
    if (salarie) p.set('salarie', salarie);
    if (statut) p.set('statut', statut);
    api(`/api/admin/pointages?${p}`).then((d) => {
      setData(d);
      // Ouverture directe depuis une alerte du dashboard
      const cible = sessionStorage.getItem('ptg5p_corriger');
      if (cible) {
        sessionStorage.removeItem('ptg5p_corriger');
        const pt = d.pointages.find((x) => x.id === cible);
        if (pt) setEdition({ ...pt });
      }
    }).catch((e) => setErreur(e.message));
  };
  useEffect(charger, [mois, salarie, statut]);

  async function corriger() {
    try {
      await api('/api/admin/pointages', { method: 'PATCH', body: {
        id: edition.id, arrivee: edition.arrivee, depart: edition.depart || undefined,
        statut: edition.statut, observation: edition.observation,
      }});
      setEdition(null);
      setInfo('Pointage corrigé — la modification est tracée dans l\'observation.');
      charger();
    } catch (e) { setErreur(e.message); }
  }

  const local = (iso) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const chip = (s) => s === 'Terminée' ? 'vert' : s === 'En cours' ? 'bleu' : s === 'Annulée' ? 'gris' : 'orange';

  return (
    <>
      <div className="entete-page"><h1>Pointages</h1></div>
      <div className="carte" style={{ marginBottom: 14 }}>
        <div className="filtres" style={{ marginBottom: 0 }}>
          <div className="champ"><label>Mois</label><input type="month" value={mois} onChange={(e) => setMois(e.target.value)} /></div>
          <div className="champ"><label>Salariée</label>
            <select value={salarie} onChange={(e) => setSalarie(e.target.value)}>
              <option value="">Toutes</option>
              {(data?.salaries || []).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div className="champ"><label>Statut</label>
            <select value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Tous</option><option>En cours</option><option>Terminée</option><option>Anomalie</option><option>Annulée</option>
            </select>
          </div>
        </div>
      </div>
      {info && <div className="bandeau ok">{info}</div>}
      {erreur && <div className="bandeau erreur">{erreur}</div>}

      {!data ? <p className="muted">Chargement…</p> : (
        <div className="carte defile" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Date</th><th>Salariée</th><th>Hôtel</th><th>Prestation</th><th className="num">Arrivée</th><th className="num">Départ</th><th className="num">Heures</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {data.pointages.map((p) => (
                <tr key={p.id}>
                  <td className="mono muted">{p.date ? new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}</td>
                  <td><div className="principal">{p.salarie}</div></td>
                  <td>{p.hotel}</td>
                  <td>{p.prestation}</td>
                  <td className="num mono arrivee">{fmt(p.arrivee)}</td>
                  <td className="num mono depart">{fmt(p.depart)}</td>
                  <td className="num mono">{p.duree ?? '—'}</td>
                  <td><span className={`chip ${chip(p.statut)}`}>{p.statut}</span></td>
                  <td><button className="btn mini" onClick={() => setEdition({ ...p })}>✏️ Rectifier</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pointages.length === 0 && <p className="muted" style={{ padding: 16 }}>Aucun pointage sur cette période.</p>}
        </div>
      )}

      {edition && (
        <div className="voile" onClick={(e) => e.target === e.currentTarget && setEdition(null)}>
          <div className="modale">
            <h2>Rectifier — {edition.salarie}</h2>
            <p className="muted petit" style={{ marginBottom: 14 }}>{edition.hotel} · {edition.prestation}</p>
            <div className="champ" style={{ marginBottom: 10 }}>
              <label>Heure d'arrivée</label>
              <input type="datetime-local" style={{ width: '100%' }} value={local(edition.arrivee)}
                onChange={(e) => setEdition({ ...edition, arrivee: new Date(e.target.value).toISOString() })} />
            </div>
            <div className="champ" style={{ marginBottom: 10 }}>
              <label>Heure de départ</label>
              <input type="datetime-local" style={{ width: '100%' }} value={local(edition.depart)}
                onChange={(e) => setEdition({ ...edition, depart: new Date(e.target.value).toISOString() })} />
            </div>
            <div className="champ" style={{ marginBottom: 10 }}>
              <label>Statut</label>
              <select style={{ width: '100%' }} value={edition.statut}
                onChange={(e) => setEdition({ ...edition, statut: e.target.value })}>
                <option>En cours</option><option>Terminée</option><option>Anomalie</option><option>Annulée</option>
              </select>
            </div>
            <div className="champ" style={{ marginBottom: 16 }}>
              <label>Observation</label>
              <input style={{ width: '100%' }} value={edition.observation}
                onChange={(e) => setEdition({ ...edition, observation: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn vert" style={{ flex: 1, justifyContent: 'center' }} onClick={corriger}>Enregistrer</button>
              <button className="btn" onClick={() => setEdition(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
