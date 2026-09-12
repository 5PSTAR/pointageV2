import { eurCourt } from './statuts.js';

// Quatre repères, cliquables : chacun conduit là où l'action se passe.
const CARTES = [
  { cle: 'aFacturer', libelle: 'À facturer',          couleur: '' },
  { cle: 'envoyees',  libelle: 'Factures envoyées',   couleur: 'bleu' },
  { cle: 'enAttente', libelle: 'En attente de paiement', couleur: 'orange' },
  { cle: 'enRetard',  libelle: 'En retard',           couleur: 'rouge' },
];

export default function CartesIndicateurs({ indicateurs, actif, onChoisir }) {
  if (!indicateurs) return null;
  return (
    <div className="kpi-grille">
      {CARTES.map(({ cle, libelle, couleur }) => {
        const v = indicateurs[cle] || { nombre: 0, montant: 0 };
        return (
          <button
            key={cle}
            className={`kpi ${couleur} ${actif === cle ? 'actif' : ''}`}
            onClick={() => onChoisir(cle)}
            aria-pressed={actif === cle}
          >
            <span className="nb mono">{v.nombre}</span>
            <span className="lib">{libelle}</span>
            <span className="mt mono">{eurCourt(v.montant)}</span>
          </button>
        );
      })}
    </div>
  );
}
