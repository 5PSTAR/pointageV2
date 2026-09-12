import { useState } from 'react';
import { eur } from './statuts.js';

const MODES = ['Virement', 'Chèque', 'Espèces', 'Autre'];

export default function ModalePaiement({ facture, fermer, confirmer, envoi }) {
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState('Virement');
  const [reference, setReference] = useState('');
  const [montant, setMontant] = useState(String(facture.totalTTC ?? ''));

  const partiel = Number(montant) > 0 && Number(montant) < (facture.totalTTC || 0);

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale" style={{ maxWidth: 460 }}>
        <h2>Encaissement</h2>
        <p className="muted petit" style={{ marginBottom: 18 }}>
          {facture.numero} · {facture.hotel} · {eur(facture.totalTTC)} TTC attendus
        </p>

        <div className="deux-colonnes">
          <div className="champ"><label>Date de paiement</label>
            <input type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
          </div>
          <div className="champ"><label>Montant reçu (€)</label>
            <input type="number" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} />
          </div>
        </div>
        <div className="champ"><label>Mode de règlement</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="champ"><label>Référence (facultatif)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° de virement, de chèque…" />
        </div>

        {partiel && (
          <div className="bandeau erreur">
            Montant inférieur au total dû. La facture passera tout de même à « Payée »&nbsp;: le suivi des
            règlements partiels n’est pas encore géré.
          </div>
        )}

        <div className="pied-modale">
          <button className="btn" onClick={fermer}>Annuler</button>
          <button className="btn vert" disabled={envoi}
                  onClick={() => confirmer({ datePaiement, mode, reference, montant })}>
            {envoi ? 'Enregistrement…' : 'Confirmer le paiement'}
          </button>
        </div>
      </div>
    </div>
  );
}
