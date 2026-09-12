// Sélecteur de mois — deux listes déroulantes (mois + année).
//
// Remplace <input type="month">, inutilisable ici : tant que la saisie de
// l'année est incomplète, le champ natif ne renvoie plus aucune valeur
// (`value` vaut ""). React, qui contrôle le champ, y réécrit aussitôt la
// valeur précédente et efface les chiffres en cours de frappe — l'année
// paraît figée. Deux <select> suppriment le problème, reprennent l'habillage
// `.champ` existant et se comportent de la même façon sur tous les
// navigateurs. La valeur échangée reste au format « AAAA-MM ».

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const composer = (annee, mois) => `${annee}-${String(mois).padStart(2, '0')}`;

export default function SelecteurMois({ valeur, onChange, avant = 3, apres = 1 }) {
  const auj = new Date();
  let [annee, mois] = String(valeur || '').split('-').map(Number);
  // Garde-fou : une valeur absente ou mal formée retombe sur le mois courant.
  if (!Number.isInteger(annee) || !Number.isInteger(mois) || mois < 1 || mois > 12) {
    annee = auj.getFullYear();
    mois = auj.getMonth() + 1;
  }

  // Fenêtre glissante autour de l'année courante, élargie si besoin pour
  // toujours contenir l'année affichée (mois ancien ouvert depuis un lien).
  const courante = auj.getFullYear();
  const min = Math.min(courante - avant, annee);
  const max = Math.max(courante + apres, annee);
  const annees = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <>
      <div className="champ court">
        <label>Mois</label>
        <select value={mois} onChange={(e) => onChange(composer(annee, Number(e.target.value)))}>
          {MOIS.map((nom, i) => <option key={nom} value={i + 1}>{nom}</option>)}
        </select>
      </div>
      <div className="champ court">
        <label>Année</label>
        <select value={annee} onChange={(e) => onChange(composer(Number(e.target.value), mois))}>
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </>
  );
}
