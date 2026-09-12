import { useState } from 'react';
import { api } from '../../api.js';
import { eur } from './statuts.js';

const finDeMois = (mois) => {
  const [a, m] = mois.split('-').map(Number);
  return `${mois}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};
const dateFr = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR') : '—');
const ajouterJours = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const ligneVide = () => ({ prestation: '', heures: '', tarif: '', montant: '' });

/**
 * Éditeur de pièce, dessiné comme le document qui en sortira : mêmes blocs,
 * mêmes colonnes, mêmes totaux. On modifie là où on lit — ce qu'on voit à
 * l'écran est ce que le client recevra, sans avoir à l'imaginer.
 */
export default function ModaleCreation({ type, clients, prestations, emetteur, mois, fermer, succes }) {
  const [clientId, setClientId] = useState('');
  const [dateEmission, setDateEmission] = useState(finDeMois(mois));
  const [taux, setTaux] = useState(20);
  const [lignes, setLignes] = useState([ligneVide()]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const estAvoir = type === 'avoir';
  const client = clients.find((c) => c.id === clientId);
  const echeance = client && !estAvoir
    ? ajouterJours(dateEmission, client.delaiPaiement || 30)
    : null;

  const majLigne = (i, champ, valeur) =>
    setLignes(lignes.map((l, k) => (k === i ? { ...l, [champ]: valeur } : l)));

  // Quantité × prix unitaire renseigne le montant : c'est la saisie la plus
  // courante, et elle évite une multiplication faite de tête.
  const majCalcul = (i, champ, valeur) => {
    const l = { ...lignes[i], [champ]: valeur };
    const h = Number(l.heures);
    const t = Number(l.tarif);
    if (l.heures !== '' && l.tarif !== '' && Number.isFinite(h) && Number.isFinite(t)) {
      l.montant = String(Math.round(h * t * 100) / 100);
    }
    setLignes(lignes.map((x, k) => (k === i ? l : x)));
  };

  const totalHT = Math.round(lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0) * 100) / 100;
  const tva = Math.round(totalHT * (taux / 100) * 100) / 100;
  const signe = estAvoir ? '−' : '';

  async function generer() {
    setEnvoi(true); setErreur('');
    try {
      const r = await api('/api/admin/factures', {
        method: 'POST',
        // Les lignes ne portent pas de date : sur une pièce libre, la description
        // doit se réduire au titre de la prestation.
        body: { type, client: clientId, mois, dateEmission, tauxTVA: taux / 100, lignes },
      });
      // Générer et télécharger dans le même geste : la pièce est créée, le
      // document part dans les téléchargements sans un clic de plus.
      // Sans identifiant en retour, on ne déclenche rien : une URL bâtie sur
      // « undefined » emmènerait la gérante sur une page d'erreur en croyant
      // que sa facture n'a pas été créée, alors qu'elle l'a été.
      if (r?.id) {
        const a = document.createElement('a');
        a.href = `/api/admin/facture?facture=${r.id}&format=pdf`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      succes(r);
    } catch (e) { setErreur(e.message); setEnvoi(false); }
  }

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="editeur-piece">
        <div className="barre">
          <span className="titre">{estAvoir ? 'Nouvel avoir' : 'Nouvelle facture'}</span>
          <span className="aide">Clique sur un champ pour le modifier</span>
          <button className="btn" onClick={fermer}>Annuler</button>
          <button className="btn bleu" onClick={generer} disabled={envoi || !clientId || totalHT <= 0}>
            {envoi ? 'Génération…' : 'Générer et télécharger'}
          </button>
        </div>

        {erreur && <div className="bandeau erreur" style={{ margin: '0 20px' }}>{erreur}</div>}

        <div className="feuille">
          {/* ── En-tête : logo, pavé de titre, bloc client ── */}
          <div className="haut">
            <img src="/logo.png" alt="5P STAR" className="logo" />
            <div className="pave">
              <div className="type">{estAvoir ? 'AVOIR' : 'FACTURE'}</div>
              <div className="ref">n° attribué à la création</div>
            </div>
          </div>

          <div className="bloc-client">
            <select className={`saisie nom ${clientId ? '' : 'manque'}`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— choisir le client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            {client && (
              <>
                <div className="l">{client.adresse || ''}</div>
                <div className="l">{[client.codePostal, client.ville].filter(Boolean).join(' ')}</div>
                {client.tva && <div className="l petit">{client.tva}</div>}
              </>
            )}
          </div>

          {/* ── Bandeau des quatre cases ── */}
          <div className="cases">
            <div className="case"><div className="t">Mode paiement</div><div className="v">{emetteur?.modePaiement || 'Virement'}</div></div>
            <div className="case">
              <div className="t">Date</div>
              <input className="saisie v" type="date" value={dateEmission}
                onChange={(e) => setDateEmission(e.target.value)} />
            </div>
            <div className="case"><div className="t">Code client</div><div className="v">{client?.codeClient || '—'}</div></div>
            <div className="case"><div className="t">Date échéance</div><div className="v">{echeance ? dateFr(echeance) : '—'}</div></div>
          </div>

          {/* ── Corps : les lignes ── */}
          <div className="corps">
            <div className="entetes">
              <span>Description</span><span className="n">Quantité</span><span className="n">Prix unitaire HT</span><span className="n">Total HT</span><span />
            </div>
            {lignes.map((l, i) => (
              <div className="ligne" key={i}>
                <input className={`saisie libelle ${l.prestation ? '' : 'manque'}`} list="prestations-connues" placeholder="Description de la prestation…"
                  value={l.prestation} onChange={(e) => majLigne(i, 'prestation', e.target.value)} />
                <input className="saisie n" type="number" step="0.01" placeholder="—" value={l.heures}
                  onChange={(e) => majCalcul(i, 'heures', e.target.value)} />
                <input className="saisie n" type="number" step="0.01" placeholder="—" value={l.tarif}
                  onChange={(e) => majCalcul(i, 'tarif', e.target.value)} />
                <input className={`saisie n gras ${Number(l.montant) > 0 ? '' : 'manque'}`} type="number" step="0.01" placeholder="0,00" value={l.montant}
                  onChange={(e) => majLigne(i, 'montant', e.target.value)} />
                <button className="retirer" aria-label="Retirer la ligne" disabled={lignes.length === 1}
                  onClick={() => setLignes(lignes.filter((_, k) => k !== i))}>×</button>
              </div>
            ))}
            <button className="ajouter" onClick={() => setLignes([...lignes, ligneVide()])}>
              + Ajouter une ligne
            </button>
            <datalist id="prestations-connues">
              {(prestations || []).map((p) => <option key={p.id} value={p.type} />)}
            </datalist>
          </div>

          {/* ── Totaux ── */}
          <div className="totaux">
            <div className="case"><div className="t">Total HT</div><div className="v">{signe}{eur(totalHT)}</div></div>
            <div className="case">
              <div className="t">TVA <input className="saisie taux" type="number" step="0.1" value={taux}
                onChange={(e) => setTaux(Number(e.target.value))} /> %</div>
              <div className="v">{signe}{eur(tva)}</div>
            </div>
            <div className="case"><div className="t">Total TTC</div><div className="v">{signe}{eur(totalHT + tva)}</div></div>
            <div className="case"><div className="t">Déjà réglé TTC</div><div className="v">—</div></div>
          </div>

          <div className="net">
            <div className="t">{estAvoir ? 'Net à rembourser' : 'Net à payer'}</div>
            <div className="v">{signe}{eur(totalHT + tva)}</div>
          </div>

          {emetteur && (
            <div className="pied">
              <div>
                <div>{emetteur.raison}</div><div>{emetteur.adresse}</div>
                <div>{emetteur.ville}</div><div>{emetteur.siret}</div>
              </div>
              <div className="droite">
                <div>{emetteur.tel}</div><div>{emetteur.site}</div>
                <div>✉ {emetteur.mail}</div><div>{emetteur.naf}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
