import { useState } from 'react';
import { api } from '../api.js';

const heureLocale = (iso) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Déclaration d'un départ non scanné. Sans elle, la mission reste « En cours »
 * pour toujours : la salariée n'est pas payée, l'hôtel n'est pas facturé. La
 * saisie est tracée côté Airtable pour que le responsable la distingue d'un
 * pointage scanné.
 */
export default function ModaleRegularisation({ mission, fermer, succes }) {
  const [heure, setHeure] = useState(() =>
    new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace('h', ':'));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  async function valider() {
    setEnvoi(true); setErreur('');
    try {
      const r = await api('/api/salarie/regulariser', {
        method: 'POST', body: { pointageId: mission.id, heure }, delai: 15_000,
      });
      succes(r.message);
    } catch (e) { setErreur(e.message); setEnvoi(false); }
  }

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale" style={{ maxWidth: 400 }}>
        <h2 style={{ marginBottom: 6 }}>Déclarer mon départ</h2>
        <p className="muted petit" style={{ marginBottom: 16 }}>
          {mission.hotel} · {mission.prestation}<br />
          Arrivée pointée à {heureLocale(mission.arrivee)}.
        </p>

        <div className="champ">
          <label>À quelle heure es-tu partie ?</label>
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} step="60" />
        </div>

        <p className="muted petit" style={{ marginTop: 4 }}>
          Ton responsable verra que cette heure a été saisie à la main.
        </p>

        {erreur && <div className="bandeau erreur" style={{ marginTop: 12 }}>{erreur}</div>}

        <div className="pied-modale">
          <button className="btn" onClick={fermer}>Annuler</button>
          <button className="btn bleu" onClick={valider} disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer mon départ'}
          </button>
        </div>
      </div>
    </div>
  );
}
