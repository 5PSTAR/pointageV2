import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { empiler, estPanneReseau } from './filePointages.js';
import { envoyerScan, etatConnu } from './pointer.js';

/**
 * Arrêt du lecteur QR. Deux pièges, tous deux rencontrés sur le terrain :
 * — stop() lève une exception SYNCHRONE (une chaîne, pas une Error) si le
 *   lecteur n'a jamais démarré ou est déjà arrêté ;
 * — stop() est ASYNCHRONE : la bibliothèque retire ses propres éléments du
 *   conteneur dans une promesse. Changer d'écran sans l'attendre fait
 *   démonter la zone par React pendant qu'elle y travaille encore.
 * D'où une fonction qu'on ATTEND avant toute transition d'état.
 */
async function arreter(lecteur) {
  if (!lecteur) return;
  try { await lecteur.stop(); } catch { /* jamais démarré, ou déjà arrêté */ }
  try { lecteur.clear(); } catch { /* le conteneur a déjà disparu */ }
}

const idHotel = (contenu) =>
  (String(contenu).match(/^PTG:(rec[A-Za-z0-9]{14})$/) || String(contenu).match(/\/q\/(rec[A-Za-z0-9]{14})/) || [])[1] || null;

export default function Scanner({ fermer, succes, auto }) {
  // camera | envoi | choix | confirmer | manuel | differe | erreur
  const [etat, setEtat] = useState(auto ? 'envoi' : 'camera');
  const [choix, setChoix] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [erreur, setErreur] = useState('');
  const enVolRef = useRef(false);
  // L'heure du scan est figée dès le premier décodage : les allers-retours de
  // choix de prestation ne doivent pas décaler l'heure d'arrivée réelle.
  const horodatageRef = useRef(null);

  const etat0 = etatConnu();
  const hotels = etat0?.hotels || [];
  const prestations = etat0?.prestations || [];

  async function envoyer(contenu, options = {}) {
    if (enVolRef.current) return;
    enVolRef.current = true;
    if (!horodatageRef.current) horodatageRef.current = new Date().toISOString();
    setEtat('envoi');

    const corps = { horodatage: horodatageRef.current, contenu, ...options };
    try {
      const r = await envoyerScan(corps);
      enVolRef.current = false;
      if (r.action === 'choisir-prestation') { setChoix(r); setEtat('choix'); return; }
      if (r.action === 'confirmer-depart') { setConfirmation(r); setEtat('confirmer'); return; }
      succes(r.message);
    } catch (err) {
      enVolRef.current = false;
      if (!estPanneReseau(err)) { setErreur(err.message); setEtat('erreur'); return; }
      await mettreEnFile(corps);
    }
  }

  /**
   * Réseau absent. On n'abandonne jamais le pointage : on le range dans la
   * file. Encore faut-il qu'il soit complet — un départ se devine (une mission
   * est ouverte sur cet hôtel), une arrivée réclame sa prestation, sinon le
   * serveur la redemandera plus tard à un écran que personne ne regarde.
   */
  async function mettreEnFile(corps) {
    const hotelId = idHotel(corps.contenu);
    const estDepart = etat0?.enCours && etat0.enCours.hotelId === hotelId;

    if (!corps.prestationId && !estDepart && prestations.length) {
      const suggeree = etat0?.prochaine?.prestation || null;
      setChoix({
        horsLigne: true,
        contenu: corps.contenu,
        hotel: hotels.find((h) => h.id === hotelId)?.nom || "l'hôtel scanné",
        prestations,
        suggeree,
        message: 'Pas de réseau ici. Choisis ta prestation : le pointage partira tout seul dès que la connexion revient.',
      });
      setEtat('choix');
      return;
    }
    await empiler(corps);
    setEtat('differe');
  }

  // QR ouvert avec l'appareil photo du téléphone : on pointe sans passer
  // par la caméra intégrée, mais par le même chemin que tout le reste.
  useEffect(() => { if (auto) envoyer(auto); }, [auto]);

  // ── Caméra ──
  useEffect(() => {
    if (etat !== 'camera') return;
    const lecteur = new Html5Qrcode('lecteur-qr');
    let fini = false;                       // un QR reste lisible plusieurs images de suite

    lecteur.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async (texte) => {
        if (fini) return;
        fini = true;
        await arreter(lecteur);             // la caméra rend le conteneur AVANT que React le démonte
        envoyer(texte);
      },
      () => {}
    ).catch(() => {
      setErreur("Impossible d'accéder à la caméra. Autorise-la dans les réglages de ton téléphone, ou pointe sans scanner ci-dessous.");
      setEtat('erreur');
    });

    return () => { if (!fini) { fini = true; arreter(lecteur); } };
  }, [etat]);

  const lienManuel = (
    <button className="lien-discret" onClick={() => setEtat('manuel')}>
      Je n'arrive pas à scanner
    </button>
  );

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
            <div style={{ textAlign: 'center', marginTop: 8 }}>{lienManuel}</div>
          </>
        )}

        {etat === 'envoi' && (
          <div className="resultat-scan">
            <div className="gros-icone">⏳</div>
            <div className="msg">Enregistrement du pointage…</div>
          </div>
        )}

        {/* Prestation : proposée par le serveur, ou choisie hors réseau */}
        {etat === 'choix' && choix && (
          <>
            <h2 style={{ marginBottom: 6 }}>{choix.hotel}</h2>
            <p className="muted petit" style={{ marginBottom: 14 }}>{choix.message}</p>
            {choix.prestations.map((p) => (
              <button
                key={p.id}
                className={`btn ${p.type === choix.suggeree ? 'bleu' : ''}`}
                style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                onClick={() => envoyer(choix.contenu || `PTG:${choix.hotelId}`, { prestationId: p.id })}
              >
                {p.type}{p.type === choix.suggeree ? '  · prévue' : ''}
              </button>
            ))}
          </>
        )}

        {/* Garde-fou : un départ scanné juste après l'arrivée est presque
            toujours un double scan, et effacerait la prestation. */}
        {etat === 'confirmer' && confirmation && (
          <div className="resultat-scan">
            <div className="gros-icone">🤔</div>
            <div className="msg">{confirmation.message}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => succes('Ton arrivée reste enregistrée. Bonne mission !')}>
                Non, je reste
              </button>
              <button className="btn bleu" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { horodatageRef.current = new Date().toISOString(); envoyer(`PTG:${confirmation.hotelId}`, { confirmerDepart: true }); }}>
                Oui, je pars
              </button>
            </div>
          </div>
        )}

        {/* Secours : le QR est décollé, illisible, ou la caméra refusée */}
        {etat === 'manuel' && (
          <>
            <h2 style={{ marginBottom: 6 }}>Pointer sans scanner</h2>
            <p className="muted petit" style={{ marginBottom: 12 }}>
              Choisis l'hôtel où tu te trouves. Ton responsable verra que ce pointage a été saisi à la main.
            </p>
            {hotels.length === 0 && <p className="muted petit">Liste des hôtels indisponible — ouvre l'onglet Accueil une fois connectée, puis réessaie.</p>}
            <div className="liste-hotels">
              {hotels.map((h) => (
                <button key={h.id} className="btn" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }}
                  onClick={() => envoyer(`PTG:${h.id}`, { _source: 'manuel' })}>
                  <span>{h.nom}</span>
                  {h.ville && <span className="muted petit">{h.ville}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Hors réseau : le pointage est sauvé, il partira seul */}
        {etat === 'differe' && (
          <div className="resultat-scan">
            <div className="gros-icone">📥</div>
            <div className="msg">Pointage enregistré sur ton téléphone.</div>
            <p className="muted petit" style={{ marginTop: 8 }}>
              Il sera transmis automatiquement dès que le réseau revient. Tu n'as rien d'autre à faire.
            </p>
            <button className="btn bleu" style={{ marginTop: 14, justifyContent: 'center', width: '100%' }} onClick={fermer}>D'accord</button>
          </div>
        )}

        {etat === 'erreur' && (
          <div className="resultat-scan">
            <div className="gros-icone">⚠️</div>
            <div className="msg" style={{ color: 'var(--orange)' }}>{erreur}</div>
            <button className="btn" style={{ marginTop: 14 }} onClick={() => { setErreur(''); setEtat('camera'); }}>Réessayer</button>
            <div style={{ marginTop: 10 }}>{lienManuel}</div>
          </div>
        )}

        {etat !== 'differe' && (
          <button className="btn" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }} onClick={fermer}>Fermer</button>
        )}
      </div>
    </div>
  );
}
