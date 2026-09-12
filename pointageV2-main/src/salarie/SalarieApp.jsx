import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Accueil from './Accueil.jsx';
import Missions from './Missions.jsx';
import CalendrierS from './CalendrierS.jsx';
import Heures from './Heures.jsx';
const Scanner = lazy(() => import('./Scanner.jsx'));
import { api, jetonStocke } from '../api.js';
import { enAttente, retirer, surChangement } from './filePointages.js';
import { viderFile } from './pointer.js';

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
  const [file, setFile] = useState({ attente: 0, echecs: [] });
  const videEnCoursRef = useRef(false);

  const rafraichir = () => setVersion((v) => v + 1);
  const notifier = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4200); };

  // Vérifie le jeton au démarrage
  useEffect(() => {
    if (!jetonStocke()) { setErreurJeton("Ouvre d'abord ton lien personnel (envoyé par SMS) pour te connecter."); return; }
    api('/api/salarie/accueil').catch((e) => { if (e.status === 401 || e.status === 403) setErreurJeton(e.message); });
  }, []);

  // ── File d'attente : état affiché ──
  useEffect(() => {
    const relire = async () => {
      try {
        const tout = await enAttente();
        setFile({ attente: tout.filter((e) => !e.echec).length, echecs: tout.filter((e) => e.echec) });
      } catch { /* IndexedDB indisponible (navigation privée) : on continue sans file */ }
    };
    relire();
    return surChangement(relire);
  }, []);

  // ── File d'attente : renvoi automatique ──
  // Pas de Background Sync : iOS ne l'implémente pas. C'est donc la page qui
  // relance, à chaque occasion où le réseau a pu revenir.
  const ecouler = useCallback(async () => {
    if (videEnCoursRef.current || !jetonStocke() || !navigator.onLine) return;
    videEnCoursRef.current = true;
    try {
      const faits = await viderFile();
      const transmis = faits.filter((x) => x.reponse).length;
      if (transmis) {
        notifier(`${transmis} pointage${transmis > 1 ? 's' : ''} transmis.`);
        rafraichir();
      }
    } catch { /* rien à faire : la file reste, on retentera */ } finally {
      videEnCoursRef.current = false;
    }
  }, []);

  useEffect(() => {
    ecouler();
    const minuteur = setInterval(ecouler, 30_000);
    const auRetour = () => document.visibilityState === 'visible' && ecouler();
    window.addEventListener('online', ecouler);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      clearInterval(minuteur);
      window.removeEventListener('online', ecouler);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [ecouler]);

  // Scan automatique : QR d'hôtel ouvert avec l'appareil photo (/q/recXXX)
  useEffect(() => {
    if (!scanAuto || !jetonStocke()) return;
    window.history.replaceState(null, '', '/');
    // On passe par le Scanner plutôt que d'appeler l'API directement : c'est
    // lui qui sait choisir une prestation, confirmer un départ et basculer en
    // file d'attente si le réseau manque.
    setScanOuvert({ auto: `PTG:${scanAuto}` });
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
        {file.attente > 0 && (
          <div className="file-bandeau" onClick={ecouler} role="status">
            📥 {file.attente} pointage{file.attente > 1 ? 's' : ''} en attente d'envoi — ils partiront dès le retour du réseau.
          </div>
        )}
        {file.echecs.map((e) => (
          <div className="file-bandeau echec" key={e.id}>
            <div>⚠ Un pointage n'a pas pu être enregistré : {e.echec}</div>
            <div className="actions">
              <button onClick={() => setScanOuvert(true)}>Reprendre</button>
              <button onClick={() => retirer(e.id)}>Abandonner</button>
            </div>
          </div>
        ))}

        <Ecran key={ecran + version} ouvrirScan={() => setScanOuvert(true)} notifier={notifier} rafraichir={rafraichir} clair={clair} setClair={setClair} />
      </div>

      {scanOuvert && (
        <Suspense fallback={<div className="toast">Ouverture du scanner…</div>}>
          <Scanner
            auto={typeof scanOuvert === 'object' ? scanOuvert.auto : null}
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
