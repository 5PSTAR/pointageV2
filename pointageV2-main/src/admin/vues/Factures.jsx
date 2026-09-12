import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { eur, periodeFr } from '../facturation/statuts.js';
import SelecteurPeriode from '../facturation/SelecteurPeriode.jsx';
import TotalFacture from '../facturation/TotalFacture.jsx';
import CartesIndicateurs from '../facturation/CartesIndicateurs.jsx';
import ListeFactures from '../facturation/ListeFactures.jsx';
import VuePaiements from '../facturation/VuePaiements.jsx';
import VueRelances from '../facturation/VueRelances.jsx';
import FicheFacture from '../facturation/FicheFacture.jsx';
import ModaleEnvoi from '../facturation/ModaleEnvoi.jsx';
import ModalePaiement from '../facturation/ModalePaiement.jsx';
import ModaleCreation from '../facturation/ModaleCreation.jsx';
import ModaleRelance from '../facturation/ModaleRelance.jsx';

// Centre de pilotage de la facturation. Les trois sous-onglets vivent dans
// l'état local : l'application n'a pas de routeur et la sidebar reste inchangée.
/** Clé d'une ligne à facturer : un hôtel pour un mois donné. */
export const cleLigne = (l) => `${l.hotelId}|${l.mois}`;
const cleEnCible = (cle) => {
  const [hotelId, mois] = cle.split('|');
  return { hotelId, mois };
};

const ONGLETS = [
  { cle: 'factures', libelle: 'Factures' },
  { cle: 'paiements', libelle: 'Paiements' },
  { cle: 'relances', libelle: 'Relances' },
];

export default function Factures() {
  const [periode, setPeriode] = useState({
    periode: 'mois',
    mois: new Date().toISOString().slice(0, 7),
    annee: String(new Date().getFullYear()),
  });
  const [hotel, setHotel] = useState('');
  const [refs, setRefs] = useState(null);
  const [creation, setCreation] = useState(null);   // 'facture' | 'avoir'
  const [data, setData] = useState(null);

  const [onglet, setOnglet] = useState('factures');
  const [filtreKpi, setFiltreKpi] = useState(null);
  const [filtrePaiement, setFiltrePaiement] = useState('tous');
  const [selection, setSelection] = useState([]);
  const [ficheId, setFicheId] = useState(null);
  const [modale, setModale] = useState(null);

  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => { api('/api/admin/referentiels').then(setRefs).catch(() => {}); }, []);

  const requete = [
    `periode=${periode.periode}`,
    periode.periode === 'mois' ? `mois=${periode.mois}` : '',
    periode.periode === 'annee' ? `annee=${periode.annee}` : '',
    hotel ? `hotel=${hotel}` : '',
  ].filter(Boolean).join('&');

  function charger() {
    setChargement(true); setErreur('');
    return api(`/api/admin/factures?${requete}`)
      .then(setData)
      .catch((e) => { setErreur(e.message); setData(null); })
      .finally(() => setChargement(false));
  }
  useEffect(() => { setSelection([]); setFicheId(null); charger(); }, [requete]);

  const libellePeriode = periode.periode === 'mois'
    ? periodeFr(periode.mois)
    : periode.periode === 'annee' ? `année ${periode.annee}` : 'tout l’historique';

  const signaler = (msg) => { setInfo(msg); setTimeout(() => setInfo(''), 7000); };

  async function apresAction(promesse, msg) {
    setEnvoi(true); setErreur('');
    try {
      await promesse;
      setModale(null);
      await charger();
      signaler(msg);
    } catch (e) { setErreur(e.message); }
    setEnvoi(false);
  }

  async function generer(cibles) {
    setEnvoi(true); setErreur('');
    try {
      const resultats = [];
      // Une facture après l'autre : la numérotation est séquentielle, deux
      // générations simultanées produiraient le même numéro. Chaque cible
      // porte son propre mois — la vue peut couvrir plusieurs périodes.
      for (const c of cibles) {
        const r = await api('/api/admin/factures', { method: 'POST', body: { mois: c.mois, hotel: c.hotelId } });
        resultats.push(r);
      }
      const creees = resultats.flatMap((r) => r.creees);
      const ignorees = resultats.flatMap((r) => r.ignorees);
      setSelection([]);
      await charger();
      if (creees.length) signaler(`${creees.length} facture(s) générée(s) : ${creees.map((c) => c.numero).join(', ')}.`);
      if (ignorees.length) setErreur(`Non générées — ${ignorees.map((i) => `${i.hotel} (${i.raison})`).join(' · ')}`);
      if (!creees.length && !ignorees.length) signaler('Aucune facture à générer : tout est déjà facturé sur ce mois.');
    } catch (e) { setErreur(e.message); }
    setEnvoi(false);
  }

  function surAction(action, facture) {
    if (action === 'generer') return generer([{ hotelId: facture.hotelId, mois: facture.mois }]);
    if (action === 'generer-selection') return generer(selection.map(cleEnCible));
    if (action === 'voir') return setFicheId(facture.id);
    if (action === 'envoyer') return setModale({ type: 'envoi', facture });
    if (action === 'payer') return setModale({ type: 'paiement', facture });
    if (action === 'relancer') return setModale({ type: 'relance', facture });
    if (action === 'annuler-paiement') {
      if (!window.confirm(`Annuler le paiement de la facture ${facture.numero} ? Le règlement sera effacé et la facture repassera en attente.`)) return;
      return apresAction(
        api('/api/admin/factures', { method: 'PATCH', body: { id: facture.id, action: 'annuler-paiement' } }),
        `Paiement de la facture ${facture.numero} annulé — elle repasse en attente.`,
      );
    }
    if (action === 'avoir') {
      if (!window.confirm(
        `Émettre un avoir pour la facture ${facture.numero} ?\n\n`
        + `Une nouvelle pièce sera créée, avec son propre numéro et un montant de `
        + `${eur(facture.totalHT)} € en négatif. La facture ${facture.numero} n'est pas modifiée : `
        + `le client en détient un exemplaire.`)) return;
      return apresAction(
        api('/api/admin/factures', { method: 'PATCH', body: { id: facture.id, action: 'avoir' } }),
        `Avoir émis pour ${facture.numero}.`,
      );
    }
    if (action === 'annuler') {
      if (!window.confirm(`Annuler la facture ${facture.numero} ? Elle restera dans la base, marquée « Annulée ».`)) return;
      return apresAction(
        api('/api/admin/factures', { method: 'PATCH', body: { id: facture.id, action: 'annuler' } }),
        `Facture ${facture.numero} annulée.`,
      );
    }
    return undefined;
  }

  const lignes = data?.lignes || [];
  const fiche = ficheId ? lignes.find((l) => l.id === ficheId) : null;

  // Le filtre issu d'un clic sur un indicateur ne s'applique qu'à la liste.
  const lignesListe = lignes.filter((l) => {
    if (filtreKpi === 'aFacturer') return l.statut === 'a_facturer';
    if (filtreKpi === 'envoyees') return Boolean(l.dateEnvoi);
    return true;
  });

  function choisirIndicateur(cle) {
    if (cle === 'enAttente') { setOnglet('paiements'); setFiltrePaiement('en_attente'); setFiltreKpi(null); return; }
    if (cle === 'enRetard') { setOnglet('relances'); setFiltreKpi(null); return; }
    setOnglet('factures');
    setFiltreKpi(filtreKpi === cle ? null : cle);
  }

  // Les exports groupés ne portent que sur des factures émises et non annulées,
  // et sur un mois précis : un PDF de toute une année n'aurait pas de sens.
  const emises = lignes.filter((l) => l.id && l.statut !== 'annulee').length;
  const groupable = emises > 0 && periode.periode === 'mois';
  const aGenerer = lignes.filter((l) => l.statut === 'a_facturer' && !l.bloquant && !l.tarifManquant)
    .map((l) => ({ hotelId: l.hotelId, mois: l.mois }));

  const compteurs = {
    factures: lignes.length,
    paiements: lignes.filter((l) => l.dateEnvoi || l.statut === 'payee').length,
    relances: lignes.filter((l) => l.statut === 'en_retard').length,
  };

  if (fiche) {
    return (
      <>
        {erreur && <div className="bandeau erreur">{erreur}</div>}
        {info && <div className="bandeau ok">{info}</div>}
        <FicheFacture facture={fiche} onRetour={() => setFicheId(null)} onAction={surAction} />
        {modale && <Modales modale={modale} fermer={() => setModale(null)} envoi={envoi} apresAction={apresAction} />}
      </>
    );
  }

  return (
    <>
      <div className="entete-page">
        <h1>Facturation</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className={`btn ${groupable ? '' : 'desactive'}`}
             href={groupable ? `/api/admin/facture?mois=${periode.mois}&groupe=1&format=pdf` : '#'}
             onClick={(e) => !groupable && e.preventDefault()}
             title={groupable ? `Les ${emises} factures du mois en un seul PDF` : 'Choisissez un mois précis comportant des factures émises'}>
            Toutes les factures · PDF
          </a>
          <a className={`btn ${groupable ? '' : 'desactive'}`}
             href={groupable ? `/api/admin/facture?mois=${periode.mois}&groupe=1&format=xlsx` : '#'}
             onClick={(e) => !groupable && e.preventDefault()}
             title={groupable ? 'Récapitulatif du mois + une feuille par facture' : 'Choisissez un mois précis comportant des factures émises'}>
            Excel
          </a>
          {/* Créer une pièce à la main : le mode « libre », et le rattrapage
              quand la facturation automatique n'a pas produit ce qu'il fallait. */}
          <select className="btn creer" value="" aria-label="Créer une pièce"
                  onChange={(e) => { if (e.target.value) setCreation(e.target.value); }}>
            <option value="">+ Créer…</option>
            <option value="facture">Une facture</option>
            <option value="avoir">Un avoir</option>
          </select>
          <button className="btn bleu" disabled={envoi || chargement || !aGenerer.length}
                  onClick={() => generer(aGenerer)}
                  title={aGenerer.length ? `${aGenerer.length} facture(s) à générer` : 'Rien à générer sur cette période'}>
            {envoi ? 'Génération…' : `Générer ${aGenerer.length || ''} facture(s)`.replace('  ', ' ')}
          </button>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: 14 }}>
        <div className="filtres" style={{ marginBottom: 0 }}>
          <SelecteurPeriode valeur={periode} onChange={setPeriode} />
          <div className="champ"><label>Hôtel</label>
            <select value={hotel} onChange={(e) => setHotel(e.target.value)}>
              <option value="">Tous les hôtels</option>
              {(refs?.hotels || []).map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </div>
        </div>
      </div>

      <TotalFacture total={data?.totalFacture} libellePeriode={libellePeriode} />

      <CartesIndicateurs indicateurs={data?.indicateurs} actif={filtreKpi} onChoisir={choisirIndicateur} />

      <div className="sous-onglets">
        {ONGLETS.map((o) => (
          <button key={o.cle} className={onglet === o.cle ? 'actif' : ''} onClick={() => setOnglet(o.cle)}>
            {o.libelle}<span className="compteur">{compteurs[o.cle]}</span>
          </button>
        ))}
      </div>

      {erreur && <div className="bandeau erreur">{erreur}</div>}
      {info && <div className="bandeau ok">{info}</div>}
      {data?.tarifManquant && (
        <div className="bandeau erreur">
          Un tarif est introuvable — vérifiez la catégorie de l’hôtel et les colonnes « Tarif 3 étoiles » /
          « Tarif 4 étoiles » dans la table Prestations. Ces hôtels ne peuvent pas être facturés.
        </div>
      )}
      {data?.aRegulariser?.length > 0 && (
        <div className="bandeau erreur">
          <strong>{data.aRegulariser.length} pointage{data.aRegulariser.length > 1 ? 's' : ''} hors facturation</strong> —
          une prestation réalisée qui n'est rattachée à aucun hôtel exploitable ne sera jamais facturée.
          Rattache-la depuis l'onglet <em>Pointages</em>.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {data.aRegulariser.map((p) => (
              <li key={p.id} className="petit">
                {p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('fr-FR') : '—'}
                {p.numero ? ` · n°${p.numero}` : ''} · {p.salarie} · {p.prestation}
                {p.duree ? ` · ${String(p.duree).replace('.', ',')} h` : ''} — {p.raison}
              </li>
            ))}
          </ul>
        </div>
      )}
      {chargement && <p className="muted">Chargement…</p>}

      {data && onglet === 'factures' && (
        <ListeFactures lignes={lignesListe} envoi={envoi} selection={selection} setSelection={setSelection}
                       onOuvrir={(f) => setFicheId(f.id)} onAction={surAction} />
      )}
      {data && onglet === 'paiements' && (
        <VuePaiements lignes={lignes} filtre={filtrePaiement} setFiltre={setFiltrePaiement}
                      onEncaisser={(f) => setModale({ type: 'paiement', facture: f })}
                      onOuvrir={(f) => setFicheId(f.id)} />
      )}
      {data && onglet === 'relances' && (
        <VueRelances lignes={lignes}
                     onRelancer={(f) => setModale({ type: 'relance', facture: f })}
                     onOuvrir={(f) => setFicheId(f.id)} />
      )}

      {modale && <Modales modale={modale} fermer={() => setModale(null)} envoi={envoi} apresAction={apresAction} />}

      {creation && (
        <ModaleCreation
          type={creation}
          clients={(refs?.hotels || []).filter((h) => h.nom)}
          prestations={refs?.prestations || []}
          emetteur={refs?.emetteur}
          mois={periode.mois || new Date().toISOString().slice(0, 7)}
          fermer={() => setCreation(null)}
          succes={(r) => {
            setCreation(null);
            signaler(`${r.type === 'avoir' ? 'Avoir' : 'Facture'} ${r.numero} créé${r.type === 'avoir' ? '' : 'e'}.`);
            charger();
          }}
        />
      )}
    </>
  );
}

function Modales({ modale, fermer, envoi, apresAction }) {
  const f = modale.facture;
  if (modale.type === 'envoi') {
    return <ModaleEnvoi facture={f} fermer={fermer} envoi={envoi} confirmer={() => apresAction(
      api('/api/admin/factures', { method: 'PATCH', body: { id: f.id, action: 'envoyer' } }),
      `Facture ${f.numero} marquée comme envoyée — elle passe en attente de paiement.`,
    )} />;
  }
  if (modale.type === 'paiement') {
    return <ModalePaiement facture={f} fermer={fermer} envoi={envoi} confirmer={(v) => apresAction(
      api('/api/admin/factures', {
        method: 'PATCH',
        body: { id: f.id, action: 'payer', datePaiement: v.datePaiement, mode: v.mode, reference: v.reference, montant: v.montant },
      }),
      `Facture ${f.numero} réglée.`,
    )} />;
  }
  return <ModaleRelance facture={f} fermer={fermer} envoi={envoi} confirmer={(v) => apresAction(
    api('/api/admin/relances', {
      method: 'POST',
      body: { factureId: f.id, niveau: v.niveau, destinataire: v.destinataire, objet: v.objet, message: v.message },
    }),
    `Relance ${v.niveau} enregistrée pour ${f.hotel}.`,
  )} />;
}
