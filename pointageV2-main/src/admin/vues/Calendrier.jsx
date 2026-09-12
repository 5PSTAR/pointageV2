import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ModaleAffectation from '../ModaleAffectation.jsx';

const decaleMois = (mois, delta) => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function Calendrier() {
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [refs, setRefs] = useState(null);
  const [modale, setModale] = useState(null);      // { mode, initial }
  const [envoi, setEnvoi] = useState(false);
  const [erreurModale, setErreurModale] = useState('');
  const [info, setInfo] = useState('');

  const charger = () => {
    setData(null);
    return api(`/api/admin/calendrier?mois=${mois}`)
      .then(setData).catch(() => setData({ items: [], aujourdhui: '' }));
  };
  useEffect(() => { charger(); }, [mois]);
  useEffect(() => { api('/api/admin/referentiels').then(setRefs).catch(() => {}); }, []);

  const signaler = (msg) => { setInfo(msg); setTimeout(() => setInfo(''), 6000); };

  /** Enchaîne l'appel, la fermeture et le rechargement — commun aux 4 actions. */
  async function appliquer(appel, msg) {
    setEnvoi(true); setErreurModale('');
    try {
      await appel;
      setModale(null); setDetail(null);
      await charger();
      signaler(msg);
    } catch (e) { setErreurModale(e.message); }
    setEnvoi(false);
  }

  function validerModale(f) {
    if (modale.mode === 'remplacer') {
      return appliquer(
        api('/api/admin/affectations', { method: 'POST', body: {
          remplacer: true, id: modale.initial.id, salarieId: f.salarieId, commentaires: f.commentaires,
        } }),
        'Remplacement enregistré — l’affectation d’origine est annulée et conservée.',
      );
    }
    const corps = {
      salarieId: f.salarieId, clientId: f.clientId, prestationId: f.prestationId,
      date: f.date, heure: f.heure, statut: f.statut, commentaires: f.commentaires,
    };
    if (modale.mode === 'modifier') {
      return appliquer(
        api('/api/admin/affectations', { method: 'PATCH', body: { id: modale.initial.id, ...corps } }),
        'Prestation mise à jour.',
      );
    }
    return appliquer(
      api('/api/admin/affectations', { method: 'POST', body: corps }),
      'Prestation planifiée.',
    );
  }

  function supprimerAffectation() {
    if (!window.confirm('Supprimer définitivement cette prestation planifiée ? Pour garder une trace, préférez le statut « Annulé ».')) return;
    return appliquer(
      api(`/api/admin/affectations?id=${modale.initial.id}`, { method: 'DELETE' }),
      'Prestation supprimée.',
    );
  }

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
    it.statut === 'Terminée' || it.statut === 'Effectué' ? 'faite'
    : it.statut === 'Annulé' ? 'annulee'
    : it.statut === 'Anomalie' || it.statut === 'Non réalisée' ? 'anomalie'
    : 'prevue';
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  // Planifier depuis l'en-tête : aujourd'hui si on est sur le mois courant,
  // sinon le 1er du mois affiché — jamais une date hors de la grille visible.
  const dateParDefaut = data?.aujourdhui?.startsWith(mois) ? data.aujourdhui : `${mois}-01`;

  return (
    <>
      <div className="entete-page">
        <h1>Calendrier</h1>
        <button className="btn bleu" onClick={() => setModale({ mode: 'creer', initial: { date: dateParDefaut } })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Planifier une prestation
        </button>
      </div>
      {info && <div className="bandeau ok">{info}</div>}
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
                    <button className="presta ajout" title={`Planifier une prestation le ${i + 1}`}
                            onClick={() => setModale({ mode: 'creer', initial: { date: jour } })}>
                      + Planifier
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="legende">
              <span><span className="pt vert"></span>Réalisées</span>
              <span><span className="pt bleu"></span>Prévues / en cours</span>
              <span><span className="pt orange"></span>Anomalies / non réalisées</span>
              <span><span className="pt" style={{ background: 'var(--txt3)' }}></span>Annulées</span>
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
            <span className={`chip ${
              detail.statut === 'Terminée' || detail.statut === 'Effectué' ? 'vert'
              : detail.statut === 'Annulé' ? 'gris'
              : detail.statut === 'Prévue' || detail.statut === 'En cours' ? 'bleu'
              : 'orange'}`}>
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

            {/* Seule une prestation planifiée se replanifie : un pointage déjà
                scanné se corrige depuis l'onglet Pointages, pas ici. */}
            {detail.genre === 'affectation' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => { setModale({ mode: 'modifier', initial: detail }); setDetail(null); }}>
                  Modifier
                </button>
                {detail.statut !== 'Annulé' && (
                  <button className="btn orange" style={{ flex: 1, justifyContent: 'center' }}
                          onClick={() => { setModale({ mode: 'remplacer', initial: detail }); setDetail(null); }}>
                    Remplacer
                  </button>
                )}
              </div>
            )}
            <button className="btn" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} onClick={() => setDetail(null)}>Fermer</button>
          </div>
        </div>
      )}

      {modale && (
        <ModaleAffectation
          // Le formulaire initialise son état au montage : changer de cible sans
          // remonter laisserait les champs de la précédente.
          key={`${modale.mode}-${modale.initial?.id || modale.initial?.date}`}
          mode={modale.mode}
          initial={modale.initial}
          refs={refs}
          envoi={envoi}
          erreur={erreurModale}
          fermer={() => { setModale(null); setErreurModale(''); }}
          valider={validerModale}
          supprimer={supprimerAffectation}
        />
      )}
    </>
  );
}
