import { libelleStatut, chipStatut, eur, dateFr } from './statuts.js';

const FILTRES = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'en_attente', libelle: 'En attente' },
  { cle: 'en_retard', libelle: 'En retard' },
  { cle: 'payee', libelle: 'Payées' },
];

// Seules les factures parties chez le client concernent le suivi des paiements :
// un brouillon n'a rien à encaisser.
export default function VuePaiements({ lignes, filtre, setFiltre, onEncaisser, onOuvrir }) {
  const parties = lignes.filter((l) => l.dateEnvoi || l.statut === 'payee');
  const visibles = filtre === 'tous' ? parties : parties.filter((l) => l.statut === filtre);

  return (
    <>
      <div className="filtres" style={{ marginBottom: 14 }}>
        <div className="champ court">
          <label>Statut</label>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            {FILTRES.map((f) => <option key={f.cle} value={f.cle}>{f.libelle}</option>)}
          </select>
        </div>
        <div className="pousse">
          <span className="muted petit">
            Reste à encaisser&nbsp;:{' '}
            <strong className="mono">
              {eur(parties.filter((l) => l.statut !== 'payee').reduce((s, l) => s + l.totalTTC, 0))}
            </strong>{' '}
            TTC
          </span>
        </div>
      </div>

      {!visibles.length ? (
        <div className="carte" style={{ textAlign: 'center', padding: 34 }}>
          <p className="muted" style={{ margin: 0 }}>Aucune facture dans cet état sur la période.</p>
        </div>
      ) : (
        <div className="carte defile" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Hôtel</th><th>Facture</th><th className="num">Montant TTC</th>
                <th>Envoi</th><th>Échéance</th><th>Paiement</th><th>Statut</th><th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id}>
                  <td><div className="principal">{f.hotel}</div></td>
                  <td>
                    <button className="lien-tableau mono" onClick={() => onOuvrir(f)}>{f.numero}</button>
                  </td>
                  <td className="num mono">{eur(f.totalTTC)}</td>
                  <td className="mono secondaire">{dateFr(f.dateEnvoi)}</td>
                  <td className={`mono secondaire ${f.statut === 'en_retard' ? 'depart' : ''}`}>{dateFr(f.dateEcheance)}</td>
                  <td className="mono secondaire">{dateFr(f.datePaiement)}</td>
                  <td><span className={`chip ${chipStatut(f.statut)}`}>{libelleStatut(f.statut)}</span></td>
                  <td>
                    <div className="cellule-actions">
                      {f.statut !== 'payee' && (
                        <button className="btn mini vert" onClick={() => onEncaisser(f)}>Marquer comme payée</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
