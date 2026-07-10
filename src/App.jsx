import { useEffect, useState } from 'react';
import AdminApp from './admin/AdminApp.jsx';
import SalarieApp from './salarie/SalarieApp.jsx';
import { jetonStocke } from './api.js';

export default function App() {
  const [route] = useState(() => {
    const chemin = window.location.pathname;

    // /s/{jeton} → mémorise le jeton du salarié (règle d'or : 1 lien unique par salarié)
    const mSalarie = chemin.match(/^\/s\/([A-Za-z0-9_-]{12,64})/);
    if (mSalarie) {
      localStorage.setItem('ptg5p_jeton', mSalarie[1]);
      return { app: 'salarie' };
    }

    // /q/{hotelId} → QR d'hôtel scanné avec l'appareil photo : pointage automatique
    const mQr = chemin.match(/^\/q\/(rec[A-Za-z0-9]{14})/);
    if (mQr) return { app: 'salarie', scanAuto: mQr[1] };

    if (chemin.startsWith('/admin')) {
      localStorage.setItem('ptg5p_admin_vu', '1');
      return { app: 'admin' };
    }

    // Racine (ex : PWA installée) : on retombe sur le bon univers
    if (jetonStocke()) return { app: 'salarie' };
    if (localStorage.getItem('ptg5p_admin_vu')) return { app: 'admin' };
    return { app: 'accueil' };
  });

  // Thème global partagé (sombre par défaut, comme le design validé)
  const [clair, setClair] = useState(() => localStorage.getItem('ptg5p_clair') === '1');
  useEffect(() => {
    document.body.classList.toggle('clair', clair);
    localStorage.setItem('ptg5p_clair', clair ? '1' : '0');
  }, [clair]);

  if (route.app === 'admin') return <AdminApp clair={clair} setClair={setClair} />;
  if (route.app === 'salarie') return <SalarieApp clair={clair} setClair={setClair} scanAuto={route.scanAuto} />;

  return (
    <div className="accueil-neutre">
      <div className="marque" style={{ justifyContent: 'center' }}>
        <div className="badge">5P</div>
        <div><div className="nom">5P STAR</div><div className="sous">Application de pointage</div></div>
      </div>
      <p className="muted" style={{ maxWidth: 380, textAlign: 'center' }}>
        Salariée : ouvre le lien personnel qui t'a été envoyé par SMS.<br /><br />
        Administrateur : rendez-vous sur <a href="/admin" style={{ color: 'var(--bleu)' }}>/admin</a>.
      </p>
    </div>
  );
}
