import SelecteurMois from '../SelecteurMois.jsx';

// Trois façons de regarder la facturation : un mois, une année, ou tout
// l'historique. La valeur échangée décrit la période complète, pour que
// l'appelant n'ait pas à recomposer les paramètres.
const MODES = [
  { cle: 'mois', libelle: 'Un mois' },
  { cle: 'annee', libelle: 'Une année' },
  { cle: 'tout', libelle: 'Tout l’historique' },
];

export default function SelecteurPeriode({ valeur, onChange, avant = 3, apres = 1 }) {
  const courante = new Date().getFullYear();
  const anneeChoisie = Number(valeur.annee) || courante;
  const min = Math.min(courante - avant, anneeChoisie);
  const max = Math.max(courante + apres, anneeChoisie);
  const annees = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <>
      <div className="champ court">
        <label>Période</label>
        <select value={valeur.periode} onChange={(e) => onChange({ ...valeur, periode: e.target.value })}>
          {MODES.map((m) => <option key={m.cle} value={m.cle}>{m.libelle}</option>)}
        </select>
      </div>

      {valeur.periode === 'mois' && (
        <SelecteurMois valeur={valeur.mois} onChange={(mois) => onChange({ ...valeur, mois })} />
      )}

      {valeur.periode === 'annee' && (
        <div className="champ court">
          <label>Année</label>
          <select value={anneeChoisie} onChange={(e) => onChange({ ...valeur, annee: e.target.value })}>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
