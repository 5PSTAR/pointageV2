import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Accueil({ ouvrirScan, clair, setClair }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [, tic] = useState(0);

  useEffect(() => {
    api('/api/salarie/accueil').then(setData).catch((e) => setErreur(e.message));
    const t = setInterval(() => tic((x) => x + 1), 30_000); // chrono mission en cours
    return () => clearInterval(t);
  }, []);

  if (erreur) return <div className="bandeau erreur" style={{ marginTop: 20 }}>{erreur}</div>;
  if (!data) return <p className="muted" style={{ marginTop: 20 }}>Chargement…</p>;

  const dateFr = new Date(data.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const chrono = (iso) => {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  };
  const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="entete-sal">
        <div>
          <div className="hello">Bonjour {data.profil.prenom}</div>
          <div className="date-du-jour" style={{ textTransform: 'capitalize' }}>{dateFr}</div>
        </div>
        <button className="btn mini" onClick={() => setClair(!clair)} aria-label="Changer de thème">
          {clair ? '🌙' : '☀️'}
        </button>
      </div>

      {data.alerte && (
        <div className="alerte-mini">
          <div className="t">⚠ {data.alerte.titre}</div>
          <div className="d">{data.alerte.message}</div>
        </div>
      )}

      <button className="bouton-scan" onClick={ouvrirScan}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>
        <span className="l">
          {data.enCours ? 'SCANNER POUR' : 'SCANNER LE QR'}<br />
          {data.enCours ? 'POINTER MON DÉPART' : "DE L'HÔTEL"}
        </span>
      </button>

      {data.enCours ? (
        <div className="mission-cours">
          <div className="t">🕒 Ma mission en cours</div>
          <div className="h">{data.enCours.hotel}</div>
          <div className="d">
            {data.enCours.prestation} · arrivée {heure(data.enCours.arrivee)} · <span className="chrono mono">{chrono(data.enCours.arrivee)}</span>
          </div>
        </div>
      ) : data.prochaine ? (
        <div className="prochaine">
          <div className="t muted petit" style={{ fontWeight: 700 }}>AUJOURD'HUI</div>
          <div className="h" style={{ fontWeight: 700, marginTop: 4 }}>{data.prochaine.hotel}</div>
          <div className="d muted petit">
            {data.prochaine.prestation}{data.prochaine.heurePrevue ? ` · prévue à ${data.prochaine.heurePrevue}` : ''}
          </div>
        </div>
      ) : (
        <p className="muted petit" style={{ textAlign: 'center' }}>Aucune mission en cours. Scanne le QR de l'hôtel à ton arrivée.</p>
      )}
    </>
  );
}
