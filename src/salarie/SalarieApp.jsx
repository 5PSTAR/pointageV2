import { lazy, Suspense, useEffect, useState } from 'react';
import Accueil from './Accueil.jsx';
import Missions from './Missions.jsx';
import CalendrierS from './CalendrierS.jsx';
import Heures from './Heures.jsx';
const Scanner = lazy(() => import('./Scanner.jsx'));
import { api, jetonStocke } from '../api.js';

const I = {
  accueil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>,
  missions: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  heures: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M20 6H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2z"/><path d="M2 10h20M6 15h4"/></svg>,
};

export default function SalarieApp({ clair, setClair, scanAuto }) {
  const [ecran, setEcran] = useState('accueil');
  const [scanOuvert, setScanOuvert] = useState(false);
  const [toast, setToast] = useState('');
  const [version, setVersion] = useState(0); // force le rechargement des écrans après un pointage
  const [erreurJeton, setErreurJeton] = useState('');

  const rafraichir = () => setVersion((v) => v + 1);
  const notifier = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4200); };

  // Vérifie le jeton au démarrage
  useEffect(() => {
    if (!jetonStocke()) { setErreurJeton("Ouvre d'abord ton lien personnel (envoyé par SMS) pour te connecter."); return; }
    api('/api/salarie/accueil').catch((e) => { if (e.status === 401 || e.status === 403) setErreurJeton(e.message); });
  }, []);

  // Scan automatique : QR d'hôtel ouvert avec l'appareil photo (/q/recXXX)
  useEffect(() => {
    if (!scanAuto || !jetonStocke()) return;
    window.history.replaceState(null, '', '/');
    api('/api/salarie/scan', { method: 'POST', body: { contenu: `PTG:${scanAuto}` } })
      .then((r) => {
        if (r.action === 'choisir-prestation') { setScanOuvert({ prechoix: r }); return; }
        notifier(r.message); rafraichir();
      })
      .catch((e) => notifier(e.message));
  }, [scanAuto]);

  if (erreurJeton) {
    return (
      <div className="sal">
        <div className="accueil-neutre" style={{ minHeight: '80vh' }}>
          <div className="marque"><div className="badge">5P</div><div><div className="nom">5P STAR</div><div className="sous">Mon pointage</div></div></div>
          <div className="bandeau erreur" style={{ maxWidth: 340, textAlign: 'center' }}>{erreurJeton}</div>
        </div>
      </div>
    );
  }

  const ECRANS = { accueil: Accueil, missions: Missions, calendrier: CalendrierS, heures: Heures };
  const Ecran = ECRANS[ecran];

  return (
    <div className="sal">
      <div className="ecran">
        <Ecran key={ecran + version} ouvrirScan={() => setScanOuvert(true)} clair={clair} setClair={setClair} />
      </div>

      {scanOuvert && (
        <Suspense fallback={<div className="toast">Ouverture du scanner…</div>}>
          <Scanner
            prechoix={typeof scanOuvert === 'object' ? scanOuvert.prechoix : null}
            fermer={() => setScanOuvert(false)}
            succes={(msg) => { setScanOuvert(false); notifier(msg); rafraichir(); }}
          />
        </Suspense>
      )}

      {toast && <div className="toast">{toast}</div>}

      <nav className="tabs" aria-label="Navigation">
        {[['accueil', 'Accueil', I.accueil], ['missions', 'Missions', I.missions], ['calendrier', 'Calendrier', I.cal], ['heures', 'Mes heures', I.heures]].map(([id, libelle, icone]) => (
          <button key={id} className={ecran === id ? 'actif' : ''} onClick={() => setEcran(id)}>
            {icone}<span>{libelle}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
