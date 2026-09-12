import { useState } from 'react';
import { eur, dateFr, lienExport, nomFichierFacture } from './statuts.js';
import { modeleRelance, lienMailto } from './modelesMail.js';

export default function ModaleRelance({ facture, fermer, confirmer, envoi }) {
  const conseille = facture.niveauConseille || 1;
  const [niveau, setNiveau] = useState(conseille);
  const [destinataire, setDestinataire] = useState(facture.emailFacturation || '');
  const [modifie, setModifie] = useState(false);
  const modele = modeleRelance(facture, niveau);
  const [objet, setObjet] = useState(modele.objet);
  const [message, setMessage] = useState(modele.message);

  // Changer de niveau recharge le modèle, sauf si le texte a été retouché.
  function changerNiveau(n) {
    setNiveau(n);
    if (modifie) return;
    const m = modeleRelance(facture, n);
    setObjet(m.objet);
    setMessage(m.message);
  }

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale" style={{ maxWidth: 620 }}>
        <h2>Relance — {facture.hotel}</h2>
        <p className="muted petit" style={{ marginBottom: 18 }}>
          {facture.numero} · {eur(facture.totalTTC)} TTC · échéance {dateFr(facture.dateEcheance)} ·{' '}
          <strong>{facture.joursRetard} jours de retard</strong>
        </p>

        <div className="champ"><label>Niveau de relance</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button"
                      className={`btn mini ${niveau === n ? 'bleu' : ''}`}
                      onClick={() => changerNiveau(n)}>
                Relance {n}{n === conseille ? ' ·  conseillée' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="champ"><label>Destinataire</label>
          <input type="email" value={destinataire} onChange={(e) => setDestinataire(e.target.value)}
                 placeholder="comptabilite@hotel.fr" />
        </div>
        <div className="champ"><label>Objet</label>
          <input value={objet} onChange={(e) => { setObjet(e.target.value); setModifie(true); }} />
        </div>
        <div className="champ"><label>Message</label>
          <textarea rows="10" value={message} style={{ width: '100%', resize: 'vertical' }}
                    onChange={(e) => { setMessage(e.target.value); setModifie(true); }} />
        </div>

        <div className="piece-jointe">
          <span>📎</span>
          <div style={{ flex: 1 }}>
            <div className="nom-pj">{nomFichierFacture(facture)}.pdf</div>
            <div className="muted petit">À joindre au message</div>
          </div>
          <a className="btn mini" href={lienExport(facture, 'pdf')}>Télécharger</a>
        </div>

        {!destinataire && (
          <div className="bandeau erreur" style={{ marginTop: 12 }}>
            Aucune adresse de facturation pour cet hôtel — complétez « Contact facturation » dans Airtable.
          </div>
        )}

        <div className="pied-modale">
          <button className="btn" onClick={fermer}>Annuler</button>
          <a className="btn" href={lienMailto(destinataire, objet, message)}>
            Ouvrir dans ma messagerie
          </a>
          <button className="btn orange" disabled={envoi}
                  onClick={() => confirmer({ niveau, destinataire, objet, message })}>
            {envoi ? 'Enregistrement…' : 'Enregistrer la relance'}
          </button>
        </div>
      </div>
    </div>
  );
}
