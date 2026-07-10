import { useState } from 'react';
import Dashboard from './vues/Dashboard.jsx';
import Pointages from './vues/Pointages.jsx';
import Calendrier from './vues/Calendrier.jsx';
import Factures from './vues/Factures.jsx';
import Budget from './vues/Budget.jsx';
import QRCodes from './vues/QRCodes.jsx';

const I = {
  dash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  horloge: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  facture: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>,
  euro: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  qr: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M17 20h4"/></svg>,
  lune: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  soleil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
};

const ONGLETS = [
  ['dashboard', 'Dashboard', I.dash, Dashboard],
  ['pointages', 'Pointages', I.horloge, Pointages],
  ['calendrier', 'Calendrier', I.cal, Calendrier],
  ['factures', 'Factures hôtels', I.facture, Factures],
  ['budget', 'Budget salariés', I.euro, Budget],
  ['qrcodes', 'QR codes', I.qr, QRCodes],
];

export default function AdminApp({ clair, setClair }) {
  const [onglet, setOnglet] = useState('dashboard');
  const Vue = ONGLETS.find(([id]) => id === onglet)[3];
  const dateJour = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="adm">
      <aside>
        <div className="marque">
          <div className="badge">5P</div>
          <div>
            <div className="nom">5P STAR</div>
            <div className="sous">Administration</div>
          </div>
        </div>
        <nav className="menu" aria-label="Navigation">
          {ONGLETS.map(([id, libelle, icone]) => (
            <button key={id} className={onglet === id ? 'actif' : ''} onClick={() => setOnglet(id)}>
              {icone}<span>{libelle}</span>
            </button>
          ))}
        </nav>
        <div className="pied">
          <div className="date-pied">{dateJour}</div>
          <button onClick={() => setClair(!clair)}>
            {clair ? I.lune : I.soleil}<span>{clair ? 'Mode sombre' : 'Mode clair'}</span>
          </button>
        </div>
      </aside>
      <main className="adm-contenu"><Vue allerA={setOnglet} /></main>
    </div>
  );
}
