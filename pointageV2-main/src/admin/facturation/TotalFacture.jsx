import { eur } from './statuts.js';

// Ce qui a réellement été facturé sur la période affichée — annulations
// exclues. Se recalcule à chaque changement de filtre.
export default function TotalFacture({ total, libellePeriode }) {
  if (!total) return null;
  const reste = Math.round((total.ttc - total.encaisse) * 100) / 100;
  return (
    <div className="bandeau-total">
      <div>
        <div className="num-label">Total facturé · {libellePeriode}</div>
        <div className="chiffre mono">{eur(total.ht)} <span className="unite">HT</span></div>
      </div>
      <div className="detail">
        <div><span className="muted">{total.nombre} facture(s)</span></div>
        <div><span className="muted">TTC</span> <strong className="mono">{eur(total.ttc)}</strong></div>
        <div><span className="muted">Encaissé</span> <strong className="mono vert-txt">{eur(total.encaisse)}</strong></div>
        <div><span className="muted">Reste dû</span> <strong className="mono orange-txt">{eur(reste)}</strong></div>
      </div>
    </div>
  );
}
