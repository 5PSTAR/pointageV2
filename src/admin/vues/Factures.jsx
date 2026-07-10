import { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function Factures() {
  const [refs, setRefs] = useState(null);
  const [hotel, setHotel] = useState('');
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [chargement, setChargement] = useState(false);

  useEffect(() => { api('/api/admin/referentiels').then(setRefs).catch((e) => setErreur(e.message)); }, []);

  async function previsualiser(h = hotel, m = mois) {
    if (!h) return;
    setChargement(true); setErreur(''); setInfo(''); setApercu(null);
    try { setApercu(await api(`/api/admin/facture?hotel=${h}&mois=${m}`)); }
    catch (e) { setErreur(e.message); }
    setChargement(false);
  }

  async function enregistrer() {
    setChargement(true); setErreur('');
    try {
      const r = await api('/api/admin/facture', { method: 'POST', body: { hotelId: hotel, mois } });
      setInfo(`Consolidation enregistrée dans Airtable (${r.totalHT.toFixed(2)} € HT).`);
    } catch (e) { setErreur(e.message); }
    setChargement(false);
  }

  const numFacture = `FAC-${mois.replace('-', '')}-${hotel ? 'H' + (refs?.hotels.findIndex((h) => h.id === hotel) + 1) : ''}`;
  const infosHotel = refs?.hotels.find((h) => h.id === hotel);

  return (
    <>
      <div className="entete-page"><h1>Facturation</h1></div>
      <div className="facture-hero">
        <div className="barre">
          <div className="champ">
            <label>Hôtel</label>
            <select value={hotel} onChange={(e) => { setHotel(e.target.value); setApercu(null); if (e.target.value) previsualiser(e.target.value, mois); }}>
              <option value="">— Choisir —</option>
              {(refs?.hotels || []).map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </div>
          <div className="champ">
            <label>Mois</label>
            <input type="month" value={mois} onChange={(e) => { setMois(e.target.value); if (hotel) previsualiser(hotel, e.target.value); }} />
          </div>
          <div className="pousse">
            <a className={`btn ${!apercu ? 'desactive' : ''}`} href={apercu ? `/api/admin/facture?hotel=${hotel}&mois=${mois}&format=xlsx` : '#'}
               onClick={(e) => !apercu && e.preventDefault()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Excel / CSV
            </a>
            <a className="btn bleu" href={apercu ? `/api/admin/facture?hotel=${hotel}&mois=${mois}&format=pdf` : '#'}
               onClick={(e) => !apercu && e.preventDefault()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
              PDF
            </a>
          </div>
        </div>

        {chargement && <p className="muted" style={{ padding: 20 }}>Calcul en cours…</p>}
        {erreur && <div className="bandeau erreur" style={{ margin: 18 }}>{erreur}</div>}
        {info && <div className="bandeau ok" style={{ margin: 18 }}>{info}</div>}
        {!apercu && !chargement && !erreur && <p className="muted" style={{ padding: 24 }}>Sélectionnez un hôtel : la facture est calculée à partir des pointages terminés × tarif horaire par prestation.</p>}

        {apercu && (
          <>
            <div className="en-tete">
              <div>
                <div className="num-label">Facture</div>
                <div className="num mono">{numFacture}</div>
                <div className="periode">Période · {mois}</div>
              </div>
              <div className="prestataire">
                <div className="num-label">Prestataire</div>
                <div className="nomp">5P STAR — Ménage hôtelier</div>
                <div className="email">contact@5pstar.fr</div>
              </div>
            </div>

            <div className="facture-a">
              <div className="num-label">Facturé à</div>
              <div className="nom-hotel">{apercu.hotel}</div>
              <div className="adresse">{apercu.adresse}{infosHotel?.contact ? <><br />Contact · {infosHotel.contact}</> : null}</div>
            </div>

            <div className="defile">
              <table>
                <thead><tr><th>Prestation</th><th className="num">Interventions</th><th className="num">Heures</th><th className="num">Tarif</th><th className="num">Montant HT</th></tr></thead>
                <tbody>
                  {apercu.lignes.map((l, i) => (
                    <tr key={i}>
                      <td><div className="principal">{l.prestation}</div></td>
                      <td className="num mono">{l.interventions}</td>
                      <td className="num mono">{l.heures.toFixed(2)}</td>
                      <td className="num muted">{l.tarif ? `${l.tarif.toFixed(2)} €` : <span className="chip orange">manquant</span>}</td>
                      <td className="num mono montant">{l.montant.toFixed(2)} €</td>
                    </tr>
                  ))}
                  <tr className="total-ligne">
                    <td colSpan="2"><strong>TOTAL HT</strong> <span className="muted petit">({apercu.nbPointages} pointages)</span></td>
                    <td className="num mono total">{apercu.lignes.reduce((s, l) => s + l.heures, 0).toFixed(2)} h</td>
                    <td></td>
                    <td className="num mono montant" style={{ fontSize: 15 }}>{apercu.totalHT.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {apercu.tarifManquant && (
              <div className="bandeau erreur" style={{ margin: 18 }}>
                Un tarif horaire est manquant — complétez « Tarif horaire facturation » dans la table Prestations.
              </div>
            )}
            <div style={{ padding: '4px 24px 20px' }}>
              <button className="btn orange" onClick={enregistrer} disabled={chargement || !apercu.nbPointages}>
                💾 Enregistrer la consolidation dans Airtable
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
