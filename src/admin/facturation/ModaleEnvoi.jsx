import { useState } from 'react';
import { eur, dateFr, lienExport, nomFichierFacture } from './statuts.js';
import { modeleFacture, lienMailto } from './modelesMail.js';

export default function ModaleEnvoi({ facture, fermer, confirmer, envoi }) {
  const modele = modeleFacture(facture);
  const [destinataire, setDestinataire] = useState(facture.emailFacturation || '');
  const [objet, setObjet] = useState(modele.objet);
  const [message, setMessage] = useState(modele.message);
  const [pdfTelecharge, setPdfTelecharge] = useState(false);

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale" style={{ maxWidth: 620 }}>
        <h2>Envoyer la facture {facture.numero}</h2>
        <p className="muted petit" style={{ marginBottom: 18 }}>
          {facture.hotel} · {eur(facture.totalTTC)} TTC · échéance {dateFr(facture.dateEcheance)}
        </p>

        <div className="champ"><label>Destinataire</label>
          <input type="email" value={destinataire} onChange={(e) => setDestinataire(e.target.value)}
                 placeholder="comptabilite@hotel.fr" />
        </div>
        <div className="champ"><label>Objet</label>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} />
        </div>
        <div className="champ"><label>Message</label>
          <textarea rows="9" value={message} onChange={(e) => setMessage(e.target.value)}
                    style={{ width: '100%', resize: 'vertical' }} />
        </div>

        <div className="piece-jointe">
          <span>📎</span>
          <div style={{ flex: 1 }}>
            <div className="nom-pj">{nomFichierFacture(facture)}.pdf</div>
            <div className="muted petit">À télécharger puis à joindre au message</div>
          </div>
          <a className="btn mini" href={lienExport(facture, 'pdf')} onClick={() => setPdfTelecharge(true)}>
            Télécharger
          </a>
        </div>

        {!destinataire && (
          <div className="bandeau erreur" style={{ marginTop: 12 }}>
            Aucune adresse de facturation pour cet hôtel — complétez « Contact facturation » dans Airtable.
          </div>
        )}
        {!pdfTelecharge && destinataire && (
          <p className="muted petit" style={{ marginTop: 12 }}>
            L’application ouvre un brouillon dans ta messagerie&nbsp;: un lien mail ne peut pas porter de
            pièce jointe, il faut télécharger le PDF et le glisser dans le message.
          </p>
        )}

        <div className="pied-modale">
          <button className="btn" onClick={fermer}>Annuler</button>
          <a className="btn" href={lienMailto(destinataire, objet, message)}>
            Ouvrir dans ma messagerie
          </a>
          <button className="btn bleu" disabled={envoi} onClick={() => confirmer({ destinataire, objet, message })}>
            {envoi ? 'Enregistrement…' : 'Marquer comme envoyée'}
          </button>
        </div>
      </div>
    </div>
  );
}
