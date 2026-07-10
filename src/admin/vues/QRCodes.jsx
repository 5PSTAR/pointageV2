import { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function QRCodes() {
  const [qrcodes, setQrcodes] = useState(null);
  const [erreur, setErreur] = useState('');
  const [aImprimer, setAImprimer] = useState(null);

  useEffect(() => { api('/api/admin/qrcodes').then((d) => setQrcodes(d.qrcodes)).catch((e) => setErreur(e.message)); }, []);
  useEffect(() => {
    if (aImprimer) { const t = setTimeout(() => { window.print(); setAImprimer(null); }, 250); return () => clearTimeout(t); }
  }, [aImprimer]);

  if (erreur) return <div className="bandeau erreur">{erreur}</div>;

  return (
    <>
      <div className="entete-page"><h1>QR codes des hôtels</h1></div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Un QR <strong>unique par hôtel</strong>, indépendant du salarié et de la prestation : imprimez-le et affichez-le sur place.
        Au scan, l'application reconnaît la salariée (via son lien personnel) et retrouve la prestation prévue du jour.
      </p>
      {!qrcodes ? <p className="muted">Génération des QR codes…</p> : (
        <div className="grille-qr">
          {qrcodes.map((q) => (
            <div className="carte" key={q.id} style={{ textAlign: 'center' }}>
              <img src={q.image} alt={`QR code ${q.hotel}`} />
              <h3 style={{ marginTop: 8, fontSize: 14.5 }}>{q.hotel}</h3>
              <p className="muted petit">{q.adresse}</p>
              <button className="btn bleu mini" style={{ marginTop: 10 }} onClick={() => setAImprimer(q)}>🖨️ Imprimer la planche</button>
            </div>
          ))}
        </div>
      )}

      {aImprimer && (
        <div className="planche-print" style={{ padding: 50, textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>
            <span style={{ color: '#E38837' }}>5P</span> <span style={{ color: '#3D8ACE' }}>ST</span><span style={{ color: '#91BC47' }}>★</span><span style={{ color: '#3D8ACE' }}>R</span>
          </div>
          <h1 style={{ fontSize: 26, margin: '18px 0 6px', color: '#1E2A36' }}>{aImprimer.hotel}</h1>
          <p style={{ color: '#5C6B7A' }}>{aImprimer.adresse}</p>
          <img src={aImprimer.image} alt="" style={{ width: 330, margin: '26px 0', background: '#fff' }} />
          <p style={{ fontSize: 19, fontWeight: 700, color: '#1E2A36' }}>Pointage des équipes de ménage</p>
          <p style={{ maxWidth: 430, margin: '10px auto', color: '#5C6B7A' }}>
            Scanne ce QR code avec ton application 5P STAR (ou l'appareil photo de ton téléphone)
            à ton arrivée, puis à nouveau à ton départ.
          </p>
        </div>
      )}
    </>
  );
}
