import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const decaleMois = (mois, delta) => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function Calendrier() {
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setData(null);
    api(`/api/admin/calendrier?mois=${mois}`).then(setData).catch(() => setData({ items: [], aujourdhui: '' }));
  }, [mois]);

  const [an, m] = mois.split('-').map(Number);
  const premierJour = (new Date(an, m - 1, 1).getDay() + 6) % 7;
  const nbJours = new Date(an, m, 0).getDate();
  const nomMois = new Date(an, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const parJour = {};
  for (const it of data?.items || []) {
    if (!it.date) continue;
    (parJour[it.date] = parJour[it.date] || []).push(it);
  }
  const classe = (it) =>
    it.statut === 'Terminée' ? 'faite'
    : it.statut === 'Anomalie' || it.statut === 'Non réalisée' ? 'anomalie'
    : 'prevue';
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <>
      <div className="entete-page"><h1>Calendrier</h1></div>
      <div className="carte">
        <div className="cal-nav">
          <button className="btn mini" onClick={() => setMois(decaleMois(mois, -1))}>‹ Mois précédent</button>
          <h2>{nomMois} — toutes les prestations</h2>
          <button className="btn mini" onClick={() => setMois(decaleMois(mois, 1))}>Mois suivant ›</button>
        </div>
        {!data ? <p className="muted">Chargement…</p> : (
          <>
            <div className="cal">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((j) => <div className="cal-tete" key={j}>{j}</div>)}
              {Array.from({ length: premierJour }).map((_, i) => <div className="jour hors" key={`v${i}`}></div>)}
              {Array.from({ length: nbJours }).map((_, i) => {
                const jour = `${mois}-${String(i + 1).padStart(2, '0')}`;
                const items = parJour[jour] || [];
                const estAuj = jour === data.aujourdhui;
                return (
                  <div className={`jour ${estAuj ? 'aujourdhui' : ''}`} key={jour}>
                    <span className="numj">{i + 1}{estAuj ? ' · auj.' : ''}</span>
                    {items.slice(0, 3).map((it) => (
                      <button key={it.id + it.genre} className={`presta ${classe(it)}`} onClick={() => setDetail(it)}>
                        {String(it.salarie).split(' ')[0]} · {it.hotel}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <button className="presta plus" onClick={() => setDetail({ genre: 'liste', date: jour, items })}>
                        +{items.length - 3} autres…
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="legende">
              <span><span className="pt vert"></span>Réalisées</span>
              <span><span className="pt bleu"></span>Prévues / en cours</span>
              <span><span className="pt orange"></span>Anomalies / non réalisées</span>
            </div>
          </>
        )}
      </div>

      {detail && detail.genre === 'liste' && (
        <div className="voile" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="modale">
            <h2 style={{ marginBottom: 12, textTransform: 'capitalize' }}>
              {new Date(detail.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            {detail.items.map((it) => (
              <button key={it.id + it.genre} className={`presta ${classe(it)}`} style={{ marginBottom: 6, padding: '9px 11px', fontSize: 12.5 }}
                onClick={() => setDetail(it)}>
                {it.salarie} · {it.hotel} · {it.prestation}
              </button>
            ))}
            <button className="btn" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }} onClick={() => setDetail(null)}>Fermer</button>
          </div>
        </div>
      )}

      {detail && detail.genre !== 'liste' && (
        <div className="voile" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="modale">
            <span className={`chip ${detail.statut === 'Terminée' ? 'vert' : detail.statut === 'Prévue' || detail.statut === 'En cours' ? 'bleu' : 'orange'}`}>
              {detail.statut}
            </span>
            <h2 style={{ margin: '12px 0 2px' }}>{detail.salarie}</h2>
            <p className="muted" style={{ marginBottom: 14 }}>{detail.hotel} — {detail.prestation}</p>
            <table>
              <tbody>
                <tr><td className="muted">Date</td><td className="num" style={{ textTransform: 'capitalize' }}>{new Date(detail.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</td></tr>
                {detail.genre === 'pointage' ? (
                  <>
                    <tr><td className="muted">Arrivée</td><td className="num mono arrivee">{heure(detail.arrivee) || '—'}</td></tr>
                    <tr><td className="muted">Départ</td><td className="num mono depart">{heure(detail.depart) || 'en cours'}</td></tr>
                    <tr><td className="muted">Durée</td><td className="num mono total">{detail.duree != null ? `${detail.duree} h` : '—'}</td></tr>
                    {detail.observation && <tr><td className="muted">Observation</td><td className="num">{detail.observation}</td></tr>}
                  </>
                ) : (
                  <>
                    <tr><td className="muted">Heure prévue</td><td className="num mono arrivee">{detail.heurePrevue || '—'}</td></tr>
                    {detail.commentaires && <tr><td className="muted">Commentaires</td><td className="num">{detail.commentaires}</td></tr>}
                  </>
                )}
              </tbody>
            </table>
            <button className="btn" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }} onClick={() => setDetail(null)}>Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}
