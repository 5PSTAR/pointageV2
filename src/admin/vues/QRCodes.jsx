import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const CHAMPS_VIDES = { nom: '', adresse: '', contact: '', telephone: '', siret: '' };

// ── Formulaire hôtel (partagé création / édition, même modèle que l'éditeur salariés) ──
function FormulaireHotel({ initial, titre, sousTitre, libelleValider, fermer, valider, envoi, erreur }) {
  const [f, setF] = useState(initial);
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale">
        <h2>{titre}</h2>
        <p className="muted petit" style={{ marginBottom: 18 }}>{sousTitre}</p>
        <div className="champ"><label>Nom de l'hôtel *</label><input value={f.nom} onChange={maj('nom')} placeholder="Grand Hôtel Lyon" /></div>
        <div className="champ"><label>Adresse</label><input value={f.adresse} onChange={maj('adresse')} placeholder="12 rue de la République, Lyon" /></div>
        <div className="deux-colonnes">
          <div className="champ"><label>Contact principal</label><input value={f.contact} onChange={maj('contact')} placeholder="Mme Dupont" /></div>
          <div className="champ"><label>Téléphone</label><input type="tel" value={f.telephone} onChange={maj('telephone')} placeholder="+33 4 00 00 00 00" /></div>
        </div>
        <div className="champ"><label>SIRET</label><input inputMode="numeric" value={f.siret} onChange={maj('siret')} placeholder="12345678900012" /></div>
        {erreur && <div className="bandeau erreur">{erreur}</div>}
        <div className="pied-modale">
          <button className="btn" onClick={fermer}>Annuler</button>
          <button className="btn bleu" onClick={() => valider(f)} disabled={envoi}>{envoi ? 'Enregistrement…' : libelleValider}</button>
        </div>
      </div>
    </div>
  );
}

export default function QRCodes() {
  const [qrcodes, setQrcodes] = useState(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [aImprimer, setAImprimer] = useState(null);
  const [creation, setCreation] = useState(false);
  const [edition, setEdition] = useState(null);       // hôtel en cours d'édition
  const [suppression, setSuppression] = useState(null); // hôtel en attente de confirmation
  const [envoi, setEnvoi] = useState(false);
  const [erreurModale, setErreurModale] = useState('');

  const charger = () => api('/api/admin/qrcodes').then((d) => setQrcodes(d.qrcodes)).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  useEffect(() => {
    if (aImprimer) { const t = setTimeout(() => { window.print(); setAImprimer(null); }, 250); return () => clearTimeout(t); }
  }, [aImprimer]);

  const apres = (msg) => {
    setCreation(false); setEdition(null); setSuppression(null);
    setEnvoi(false); setErreurModale('');
    setInfo(msg); setTimeout(() => setInfo(''), 6000);
    setQrcodes(null); charger();
  };

  async function creerHotel(f) {
    setEnvoi(true); setErreurModale('');
    try {
      await api('/api/admin/qrcodes', { method: 'POST', body: f });
      apres('Hôtel créé — son QR code a été généré automatiquement ci-dessous.');
    } catch (e) { setErreurModale(e.message); setEnvoi(false); }
  }

  async function modifierHotel(f) {
    setEnvoi(true); setErreurModale('');
    try {
      await api('/api/admin/qrcodes', { method: 'PATCH', body: { id: edition.id, ...f } });
      apres('Hôtel mis à jour.');
    } catch (e) { setErreurModale(e.message); setEnvoi(false); }
  }

  async function supprimerHotel() {
    setEnvoi(true);
    try {
      await api(`/api/admin/qrcodes?id=${suppression.id}`, { method: 'DELETE' });
      apres(`« ${suppression.hotel} » supprimé.`);
    } catch (e) { setErreur(e.message); setEnvoi(false); setSuppression(null); }
  }

  if (erreur && !qrcodes) return <div className="bandeau erreur">{erreur}</div>;

  return (
    <>
      <div className="entete-page">
        <h1>QR codes des hôtels</h1>
        <button className="btn bleu" onClick={() => setCreation(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Ajouter un hôtel
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Un QR <strong>unique par hôtel</strong>, indépendant du salarié et de la prestation : imprimez-le et affichez-le sur place.
        Au scan, l'application reconnaît la salariée (via son lien personnel) et retrouve la prestation prévue du jour.
      </p>
      {info && <div className="bandeau ok">{info}</div>}
      {erreur && <div className="bandeau erreur">{erreur}</div>}

      {!qrcodes ? <p className="muted">Génération des QR codes…</p> : (
        <div className="grille-qr">
          {qrcodes.map((q) => (
            <div className="carte" key={q.id} style={{ textAlign: 'center' }}>
              <img src={q.image} alt={`QR code ${q.hotel}`} />
              <h3 style={{ marginTop: 8, fontSize: 14.5 }}>{q.hotel}</h3>
              <p className="muted petit">{q.adresse}</p>
              <button className="btn bleu mini" style={{ marginTop: 10 }} onClick={() => setAImprimer(q)}>🖨️ Imprimer la planche</button>
              <div className="actions-carte" style={{ marginTop: 8 }}>
                <button onClick={() => setEdition(q)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Modifier
                </button>
                <button className="supprimer" onClick={() => setSuppression(q)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modale : ajouter un hôtel ── */}
      {creation && (
        <FormulaireHotel
          initial={CHAMPS_VIDES}
          titre="Ajouter un hôtel"
          sousTitre="Le QR code sera généré automatiquement dès la création."
          libelleValider="✅ Créer l'hôtel"
          fermer={() => { setCreation(false); setErreurModale(''); }}
          valider={creerHotel}
          envoi={envoi}
          erreur={erreurModale}
        />
      )}

      {/* ── Modale : modifier un hôtel ── */}
      {edition && (
        <FormulaireHotel
          initial={{ nom: edition.hotel, adresse: edition.adresse, contact: edition.contact, telephone: edition.telephone, siret: String(edition.siret || '') }}
          titre={`Modifier — ${edition.hotel}`}
          sousTitre="Le QR code reste inchangé (il est lié à l'hôtel, pas à ses informations)."
          libelleValider="💾 Enregistrer"
          fermer={() => { setEdition(null); setErreurModale(''); }}
          valider={modifierHotel}
          envoi={envoi}
          erreur={erreurModale}
        />
      )}

      {/* ── Modale : confirmer la suppression ── */}
      {suppression && (
        <div className="voile" onClick={(e) => e.target === e.currentTarget && setSuppression(null)}>
          <div className="modale" style={{ maxWidth: 420 }}>
            <div className="confirm-supprimer">
              <div className="icone">🗑️</div>
              <h2>Supprimer cet hôtel ?</h2>
              <p className="muted" style={{ marginBottom: 18 }}>
                « {suppression.hotel} » sera supprimé définitivement. Son QR code imprimé ne fonctionnera plus,
                et les pointages passés resteront dans la base mais sans lien vers cet hôtel.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSuppression(null)}>Annuler</button>
                <button className="btn rouge" style={{ flex: 1, justifyContent: 'center' }} onClick={supprimerHotel} disabled={envoi}>Confirmer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Planche d'impression ── */}
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
