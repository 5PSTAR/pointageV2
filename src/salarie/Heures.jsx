import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Heures() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [, tic] = useState(0);

  useEffect(() => {
    api('/api/salarie/heures').then(setData).catch((e) => setErreur(e.message));
    const t = setInterval(() => tic((x) => x + 1), 10_000); // le compteur tourne
    return () => clearInterval(t);
  }, []);

  if (erreur) return <div className="bandeau erreur" style={{ marginTop: 20 }}>{erreur}</div>;
  if (!data) return <p className="muted" style={{ marginTop: 20 }}>Chargement…</p>;

  const eur = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 });
  const fmtH = (h) => String(h).replace('.', ',');

  // Compteur en direct de la prestation en cours
  let gainEnCours = null, dureeEnCours = '';
  if (data.enCours) {
    const heures = Math.max(0, (Date.now() - new Date(data.enCours.arrivee)) / 3_600_000);
    gainEnCours = heures * (data.enCours.tauxHoraire || 0);
    const mn = Math.floor(heures * 60);
    dureeEnCours = `${Math.floor(mn / 60)}h${String(mn % 60).padStart(2, '0')}`;
  }

  const badgesObtenus = data.badges.filter((b) => b.obtenu);

  return (
    <>
      <div className="titre-ecran">Mes heures et gains</div>

      {data.tauxManquant && (
        <div className="bandeau erreur">Ton taux horaire n'est pas encore renseigné — les montants s'afficheront dès qu'il le sera.</div>
      )}

      {data.enCours ? (
        <div className="gain-hero">
          <div className="t">▶ Prestation en cours</div>
          <div className="montant mono">{eur(Math.round(gainEnCours * 100) / 100)} €</div>
          <div className="d">{dureeEnCours} au {data.enCours.hotel} · le compteur tourne</div>
        </div>
      ) : (
        <div className="gain-hero" style={{ opacity: .75 }}>
          <div className="t">▶ Prestation en cours</div>
          <div className="montant mono muted">—</div>
          <div className="d">Aucune mission en cours pour le moment</div>
        </div>
      )}

      <div className="grille-2">
        <div className="mini-carte">
          <div className="l">Cette semaine</div>
          <div className="v mono">{eur(data.semaine.gains)} €</div>
          <div className="hh">{fmtH(data.semaine.heures)} h</div>
        </div>
        <div className="mini-carte">
          <div className="l">Ce mois-ci</div>
          <div className="v mono">{eur(data.moisCi.gains)} €</div>
          <div className="hh">{fmtH(data.moisCi.heures)} h</div>
        </div>
      </div>

      <div className="mini-carte" style={{ marginTop: 9 }}>
        <div className="l">Mois dernier</div>
        <div className="v mono">{eur(data.moisDer.gains)} € <span className="hh" style={{ fontWeight: 400 }}>· {fmtH(data.moisDer.heures)} h</span></div>
      </div>

      {badgesObtenus.length > 0 && (
        <div className="badges">
          {badgesObtenus.map((b) => (
            <span key={b.id} className={`badge-mini ${b.ton}`}>
              {b.ton === 'bleu' ? '★' : b.ton === 'vert' ? '🎖' : '🏆'} {b.libelle}
            </span>
          ))}
        </div>
      )}

      <p className="muted petit" style={{ textAlign: 'center', marginTop: 14 }}>
        Montants bruts estimés (heures × taux horaire), avant charges et ajustements de paie.
      </p>
    </>
  );
}
