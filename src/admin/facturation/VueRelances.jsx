import { eur, dateFr, periodeFr } from './statuts.js';

// Uniquement les impayés échus. Le niveau est suggéré d'après le retard,
// jamais appliqué tout seul : c'est une personne qui décide d'envoyer.
export default function VueRelances({ lignes, onRelancer, onOuvrir }) {
  const impayees = lignes
    .filter((l) => l.statut === 'en_retard')
    .sort((a, b) => (b.joursRetard || 0) - (a.joursRetard || 0));

  if (!impayees.length) {
    return (
      <div className="carte" style={{ textAlign: 'center', padding: 36 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Aucun impayé sur cette période</p>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Toutes les factures envoyées sont réglées ou dans les délais.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 14, maxWidth: 640 }}>
        {impayees.length} facture(s) échue(s) et non réglée(s), la plus ancienne en tête.
        Le niveau conseillé suit le retard&nbsp;: relance 1 dès 5 jours, relance 2 à 15 jours, relance 3 à 25 jours.
      </p>
      {impayees.map((f) => (
        <div key={f.id} className={`carte-relance ${(f.niveauConseille || 0) >= 3 ? 'critique' : ''}`}>
          <div className="infos">
            <div className="nom">{f.hotel}</div>
            <div className="meta">
              <span className="mono">{f.numero}</span> · {periodeFr(f.mois)} · <strong className="mono">{eur(f.totalTTC)}</strong> TTC
            </div>
            <div className="meta">
              Échéance {dateFr(f.dateEcheance)} · <span className="retard">retard {f.joursRetard} jours</span>
              {f.nbRelances > 0 && ` · ${f.nbRelances} relance(s) déjà envoyée(s)`}
            </div>
            {f.niveauConseille && (
              <div style={{ marginTop: 7 }}>
                <span className={`chip ${f.niveauConseille >= 3 ? 'rouge' : f.niveauConseille === 2 ? 'orange' : 'gris'}`}>
                  Relance {f.niveauConseille} conseillée
                </span>
              </div>
            )}
            {!f.emailFacturation && (
              <div className="meta" style={{ color: 'var(--orange)', marginTop: 6 }}>
                Aucune adresse de facturation pour cet hôtel — à compléter dans Airtable.
              </div>
            )}
            {f.relances?.length > 0 && (
              <div className="historique-relance">
                <div className="num-label" style={{ marginBottom: 6 }}>
                  Historique des relances — {f.hotel}
                </div>
                {f.relances.map((r) => (
                  <div className="item" key={r.id}>
                    <span className="mono">{dateFr(r.date)}</span>
                    <span className={`chip ${r.niveauNum >= 3 ? 'rouge' : r.niveauNum === 2 ? 'orange' : 'gris'}`}>
                      {r.niveau}
                    </span>
                    <span className="muted">
                      {r.statut === 'Envoyée' ? 'envoyée par email' : r.statut.toLowerCase()} à {r.destinataire || '—'}
                    </span>
                    {r.objet && <span className="muted petit objet-relance">« {r.objet} »</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="actions">
            <button className="btn mini" onClick={() => onOuvrir(f)}>Voir la facture</button>
            <button className="btn mini orange" onClick={() => onRelancer(f)}>Préparer la relance</button>
          </div>
        </div>
      ))}
    </>
  );
}
