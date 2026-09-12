import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Missions() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => { api('/api/salarie/missions').then(setData).catch((e) => setErreur(e.message)); }, []);

  if (erreur) return <div className="bandeau erreur" style={{ marginTop: 20 }}>{erreur}</div>;
  if (!data) return <p className="muted" style={{ marginTop: 20 }}>Chargement…</p>;

  const jour = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  const fmtDuree = (h) => h != null ? `${String(h).replace('.', ',')} h` : '';

  const enCours = data.historique.filter((p) => p.statut === 'En cours');
  const passees = data.historique.filter((p) => p.statut !== 'En cours');

  return (
    <>
      <div className="titre-ecran">Mes missions</div>

      {enCours.length > 0 && (
        <>
          <div className="section-titre">● En cours</div>
          {enCours.map((p) => (
            <div className="mission-item" key={p.id} style={{ borderLeftColor: 'var(--vert)' }}>
              <div className="h">{p.hotel}</div>
              <div className="d">{p.prestation} · arrivée {heure(p.arrivee)}</div>
            </div>
          ))}
        </>
      )}

      <div className="section-titre">→ À venir</div>
      {data.aVenir.length === 0 && <p className="muted petit">Rien de planifié pour l'instant.</p>}
      {data.aVenir.map((m) => (
        <div className="mission-item" key={m.id}>
          <div className="h" style={{ textTransform: 'capitalize' }}>{jour(m.date)}{m.heurePrevue ? ` · ${m.heurePrevue}` : ''}</div>
          <div className="d">{m.hotel} · {m.prestation}</div>
          {m.commentaires && <div className="d" style={{ fontStyle: 'italic' }}>{m.commentaires}</div>}
        </div>
      ))}

      <div className="section-titre">✓ Historique</div>
      {passees.length === 0 && <p className="muted petit">Aucune mission passée ce mois-ci.</p>}
      {passees.map((p) => (
        <div className="histo-item" key={p.id}>
          <div className="ligne-top">
            <div className="h" style={{ textTransform: 'capitalize' }}>{p.date ? jour(p.date) : '—'}</div>
            {p.statut === 'Terminée' && <span className="chip vert mono">{fmtDuree(p.duree)}</span>}
            {p.statut === 'Anomalie' && <span className="chip orange">anomalie</span>}
            {p.statut === 'Annulée' && <span className="chip gris">annulée</span>}
          </div>
          <div className="d">
            {p.hotel} · {p.prestation}{p.arrivee ? ` · ${heure(p.arrivee)}${p.depart ? ` → ${heure(p.depart)}` : ' → départ non scanné'}` : ''}
          </div>
        </div>
      ))}
    </>
  );
}
