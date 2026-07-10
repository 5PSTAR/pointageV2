import { useEffect, useState } from 'react';
import { api } from '../../api.js';

function BoutonAppeler({ nom, telephone }) {
  const [revele, setRevele] = useState(false);
  if (!telephone) return null;
  if (revele) return <a className="tel-revele" href={`tel:${String(telephone).replace(/\s/g, '')}`}>📞 {telephone}</a>;
  return <button className="btn bleu mini" onClick={() => setRevele(true)}>📞 Appeler {String(nom).split(' ')[0]}</button>;
}

export default function Dashboard({ allerA }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = () => api('/api/admin/dashboard').then(setData).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); const t = setInterval(charger, 90_000); return () => clearInterval(t); }, []);

  if (erreur) return <div className="bandeau erreur">{erreur}</div>;
  if (!data) return <p className="muted">Chargement du dashboard…</p>;

  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dureeDepuis = (iso) => {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  };
  const eur = (n) => (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

  const [an, moisNum] = data.date.split('-').map(Number);
  const premierJour = (new Date(an, moisNum - 1, 1).getDay() + 6) % 7;
  const nbJours = new Date(an, moisNum, 0).getDate();

  return (
    <>
      <div className="entete-page">
        <h1>Dashboard</h1>
        <span className="muted petit">Rafraîchissement automatique toutes les 90 s</span>
      </div>

      <div className="grille-kpi">
        <div className="kpi">
          <div className="label">Prestations en cours</div>
          <div className="valeur mono">{data.kpi.enCours}</div>
          <div className="sous">{new Set(data.enCours.map((p) => p.hotelId)).size} hôtel(s) concerné(s)</div>
        </div>
        <div className="kpi bleu">
          <div className="label">Heures aujourd'hui</div>
          <div className="valeur mono">{data.kpi.heuresJour} h</div>
          <div className="sous">{data.kpi.termineesJour} prestation(s) terminée(s)</div>
        </div>
        <div className="kpi orange">
          <div className="label">Alertes actives</div>
          <div className="valeur mono">{data.kpi.alertes}</div>
          <div className="sous">pointages manquants et anomalies</div>
        </div>
        <div className="kpi violet">
          <div className="label">Chiffre du mois</div>
          <div className="valeur mono">{eur(data.kpi.chiffreMois)} €</div>
          <div className="sous">estimation à date (heures × tarifs)</div>
        </div>
      </div>

      <div className="colonnes">
        <div className="carte">
          <h2><span className="puce vert"></span>Prestations en cours</h2>
          {data.enCours.length === 0 && <p className="muted">Personne sur site pour le moment.</p>}
          {data.enCours.map((p) => (
            <div className="ligne" key={p.id}>
              <div>
                <div className="nom">{p.salarie} — {p.hotel}</div>
                <div className="detail">{p.prestation} · arrivée {heure(p.arrivee)}</div>
              </div>
              <span className="chip vert mono">{dureeDepuis(p.arrivee)}</span>
            </div>
          ))}
        </div>

        <div className="carte">
          <h2><span className="puce orange"></span>Alertes</h2>
          {data.alertes.length === 0 && <p className="muted">Aucune alerte — tout roule ✨</p>}
          {data.alertes.map((a, i) => (
            <div className="alerte" key={i}>
              <div className="titre">
                {a.type === 'manquant' ? '⚠ Pointage manquant' : a.type === 'oubli' ? '⚠ Départ non pointé' : '⚠ Anomalie'}
              </div>
              <div className="contenu">
                {a.type === 'manquant'
                  ? `${a.salarie} programmée à ${a.heurePrevue} — ${a.hotel} (${a.prestation}) — aucun scan`
                  : `${a.salarie} — ${a.hotel} (${a.prestation}), arrivée ${new Date(a.arrivee).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
              </div>
              <div className="actions">
                <BoutonAppeler nom={a.salarie} telephone={a.telephone} />
                {a.type !== 'manquant' && (
                  <button className="btn mini" onClick={() => {
                    sessionStorage.setItem('ptg5p_corriger', a.id);
                    allerA('pointages');
                  }}>✏️ Modification manuelle</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="colonnes">
        <div className="carte defile">
          <h2><span className="puce bleu"></span>Derniers pointages</h2>
          <table>
            <thead><tr><th>Salariée</th><th>Hôtel · prestation</th><th className="num">Arrivée</th><th className="num">Départ</th><th className="num">Heures</th></tr></thead>
            <tbody>
              {data.derniers.map((p) => (
                <tr key={p.id}>
                  <td><div className="principal">{p.salarie}</div></td>
                  <td>{p.hotel}<div className="secondaire">{p.prestation}</div></td>
                  <td className="num mono arrivee">{heure(p.arrivee)}</td>
                  <td className="num mono depart">{p.depart ? heure(p.depart) : '…'}</td>
                  <td className="num">
                    {p.statut === 'En cours' ? <span className="chip bleu">en cours</span>
                      : p.statut === 'Anomalie' ? <span className="chip orange">anomalie</span>
                      : <span className="mono total">{p.duree ?? '—'}{p.duree ? ' h' : ''}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="carte">
          <h2><span className="puce vert"></span>Calendrier des prestations</h2>
          <div className="cal-mini">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => <div className="cal-tete" key={i}>{j}</div>)}
            {Array.from({ length: premierJour }).map((_, i) => <div className="jour" style={{ opacity: .3 }} key={`v${i}`}></div>)}
            {Array.from({ length: nbJours }).map((_, i) => {
              const jour = `${data.date.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`;
              const d = data.calendrier[jour];
              const estAuj = jour === data.date;
              return (
                <div className={`jour ${estAuj ? 'aujourdhui' : ''}`} key={i}>
                  {i + 1}
                  <div className="pastilles">
                    {d?.fait && <span className="pt vert"></span>}
                    {d?.prevu && <span className="pt" style={{ background: estAuj ? '#fff' : 'var(--bleu)' }}></span>}
                    {d?.anomalie && <span className="pt orange"></span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="legende">
            <span><span className="pt vert"></span>Réalisées</span>
            <span><span className="pt bleu"></span>Prévues</span>
            <span><span className="pt orange"></span>Anomalies</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button className="btn mini" onClick={() => allerA('calendrier')}>Voir le calendrier complet →</button>
          </div>
        </div>
      </div>
    </>
  );
}
