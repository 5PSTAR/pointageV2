import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { memoriserEtat } from './pointer.js';
import ModaleRegularisation from './ModaleRegularisation.jsx';

export default function Accueil({ ouvrirScan, notifier, rafraichir, clair, setClair }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [regularise, setRegularise] = useState(false);
  const [, tic] = useState(0);

  // L'état est recopié sur le téléphone : hors réseau, le scanner doit pouvoir
  // décider seul entre arrivée et départ, et proposer les prestations.
  const charger = useCallback(() => {
    setErreur('');
    return api('/api/salarie/accueil')
      .then((d) => { setData(d); memoriserEtat(d); })
      .catch((e) => setErreur(e.message));
  }, []);

  useEffect(() => {
    charger();
    // Un écran figé sur « pas de connexion » alors que le réseau est revenu
    // décourage de pointer : on retente dès que le téléphone se reconnecte.
    const auRetour = () => document.visibilityState === 'visible' && charger();
    window.addEventListener('online', charger);
    document.addEventListener('visibilitychange', auRetour);
    const t = setInterval(() => tic((x) => x + 1), 30_000); // chrono mission en cours
    return () => {
      clearInterval(t);
      window.removeEventListener('online', charger);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [charger]);

  if (erreur) return (
    <div className="bandeau erreur" style={{ marginTop: 20 }}>
      {erreur}
      <button className="lien-discret" onClick={charger}>Réessayer</button>
    </div>
  );
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
          {data.alerte.type === 'depart-oublie' && data.enCours && (
            <button className="lien-discret" onClick={() => setRegularise(true)}>Déclarer mon heure de départ</button>
          )}
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
          {/* Un départ oublié ne se rattrape pas tout seul : la porte de
              sortie doit rester visible sans attendre l'alerte des 12 h. */}
          <button className="lien-discret" onClick={() => setRegularise(true)}>J'ai oublié de scanner mon départ</button>
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

      {regularise && data.enCours && (
        <ModaleRegularisation
          mission={data.enCours}
          fermer={() => setRegularise(false)}
          succes={(msg) => { setRegularise(false); notifier?.(msg); rafraichir?.(); }}
        />
      )}
    </>
  );
}
