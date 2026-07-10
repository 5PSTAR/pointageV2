import { useEffect, useState } from 'react';
import { api } from '../api.js';

const decaleMois = (mois, delta) => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function CalendrierS() {
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [jourChoisi, setJourChoisi] = useState(null);

  useEffect(() => {
    setData(null); setJourChoisi(null);
    api(`/api/salarie/calendrier?mois=${mois}`).then((d) => {
      setData(d);
      if (d.aujourdhui?.startsWith(mois)) setJourChoisi(d.aujourdhui);
    }).catch(() => setData({ items: [], aujourdhui: '' }));
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
  const couleur = (it) =>
    it.statut === 'Terminée' ? 'var(--vert)'
    : it.statut === 'Anomalie' || it.statut === 'Non réalisée' ? 'var(--orange)'
    : 'var(--bleu)';
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;

  const itemsChoisis = jourChoisi ? (parJour[jourChoisi] || []) : [];

  return (
    <>
      <div className="titre-ecran">Calendrier</div>
      <div className="cal-nav-mini">
        <button onClick={() => setMois(decaleMois(mois, -1))} aria-label="Mois précédent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="mois">{nomMois}</div>
        <button onClick={() => setMois(decaleMois(mois, 1))} aria-label="Mois suivant">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {!data ? <p className="muted">Chargement…</p> : (
        <>
          <div className="cal-s">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => <div className="tete" key={i}>{j}</div>)}
            {Array.from({ length: premierJour }).map((_, i) => <div className="j hors" key={`v${i}`}></div>)}
            {Array.from({ length: nbJours }).map((_, i) => {
              const jour = `${mois}-${String(i + 1).padStart(2, '0')}`;
              const items = parJour[jour] || [];
              const estAuj = jour === data.aujourdhui;
              return (
                <button className={`j ${estAuj ? 'aujourdhui' : ''} ${jourChoisi === jour && !estAuj ? 'choisi' : ''}`}
                  key={jour} onClick={() => setJourChoisi(jour)}>
                  {i + 1}
                  <span className="pt-row">
                    {items.slice(0, 3).map((it, k) => (
                      <span className="pt" key={k} style={{ background: estAuj ? '#fff' : couleur(it) }}></span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="legende-mini">
            <span><span className="pt" style={{ background: 'var(--vert)' }}></span>Réalisée</span>
            <span><span className="pt" style={{ background: 'var(--bleu)' }}></span>Prévue</span>
            <span><span className="pt" style={{ background: 'var(--orange)' }}></span>Anomalie</span>
          </div>

          {jourChoisi && (
            <div className="detail-jour">
              <div className="t" style={{ textTransform: 'capitalize' }}>
                {jourChoisi === data.aujourdhui ? "Aujourd'hui · " : ''}
                {new Date(jourChoisi + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })}
              </div>
              {itemsChoisis.length === 0 && <div className="d" style={{ marginTop: 4 }}>Aucune mission ce jour-là.</div>}
              {itemsChoisis.map((it) => (
                <div key={it.id + it.genre} style={{ marginTop: 8 }}>
                  <div className="h">{it.hotel}</div>
                  <div className="d">
                    {it.prestation}
                    {it.genre === 'pointage'
                      ? ` · ${it.statut === 'En cours' ? 'en cours' : it.statut.toLowerCase()}${it.duree ? ` · ${String(it.duree).replace('.', ',')} h` : ''}${it.arrivee ? ` (${heure(it.arrivee)}${it.depart ? ` → ${heure(it.depart)}` : ''})` : ''}`
                      : ` · ${it.statut.toLowerCase()}${it.heurePrevue ? ` à ${it.heurePrevue}` : ''}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
