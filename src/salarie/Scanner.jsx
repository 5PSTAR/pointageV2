import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api.js';

export default function Scanner({ fermer, succes, prechoix }) {
  const [etat, setEtat] = useState(prechoix ? 'choix' : 'camera'); // camera | envoi | choix | erreur
  const [choix, setChoix] = useState(prechoix || null);
  const [erreur, setErreur] = useState('');
  const lecteurRef = useRef(null);
  const envoyeRef = useRef(false);

  async function envoyer(contenu, prestationId) {
    if (envoyeRef.current) return;
    envoyeRef.current = true;
    setEtat('envoi');
    try {
      const r = await api('/api/salarie/scan', { method: 'POST', body: { contenu, prestationId } });
      if (r.action === 'choisir-prestation') {
        envoyeRef.current = false;
        setChoix(r); setEtat('choix');
        return;
      }
      succes(r.message);
    } catch (e) {
      envoyeRef.current = false;
      setErreur(e.message); setEtat('erreur');
    }
  }

  useEffect(() => {
    if (etat !== 'camera') return;
    const lecteur = new Html5Qrcode('lecteur-qr');
    lecteurRef.current = lecteur;
    lecteur.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      (texte) => { lecteur.stop().catch(() => {}); envoyer(texte); },
      () => {}
    ).catch(() => {
      setErreur("Impossible d'accéder à la caméra. Autorise la caméra dans les réglages, ou scanne le QR avec l'appareil photo du téléphone : il ouvrira l'application automatiquement.");
      setEtat('erreur');
    });
    return () => { lecteur.stop().catch(() => {}); };
  }, [etat]);

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale">
        {etat === 'camera' && (
          <>
            <h2 style={{ marginBottom: 10 }}>Scanner le QR de l'hôtel</h2>
            <div id="lecteur-qr" className="scanner-zone"></div>
            <p className="muted petit" style={{ marginTop: 10, textAlign: 'center' }}>
              Vise le QR code affiché à l'accueil de l'hôtel
            </p>
          </>
        )}

        {etat === 'envoi' && (
          <div className="resultat-scan">
            <div className="gros-icone">⏳</div>
            <div className="msg">Enregistrement du pointage…</div>
          </div>
        )}

        {etat === 'choix' && choix && (
          <>
            <h2 style={{ marginBottom: 6 }}>{choix.hotel}</h2>
            <p className="muted petit" style={{ marginBottom: 14 }}>{choix.message}</p>
            {choix.prestations.map((p) => (
              <button key={p.id} className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                onClick={() => envoyer(`PTG:${choix.hotelId}`, p.id)}>
                {p.type}
              </button>
            ))}
          </>
        )}

        {etat === 'erreur' && (
          <div className="resultat-scan">
            <div className="gros-icone">⚠️</div>
            <div className="msg" style={{ color: 'var(--orange)' }}>{erreur}</div>
            <button className="btn" style={{ marginTop: 14 }} onClick={() => { envoyeRef.current = false; setErreur(''); setEtat('camera'); }}>Réessayer</button>
          </div>
        )}

        <button className="btn" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }} onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}
