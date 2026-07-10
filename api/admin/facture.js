// Onglet Factures hôtels — heures réalisées × tarif horaire par prestation (tarif global)
// GET  ?hotel=recX&mois=AAAA-MM                → prévisualisation JSON
// GET  ?hotel=recX&mois=AAAA-MM&format=pdf|xlsx → export fichier
// POST { hotelId, mois }                        → enregistre la consolidation dans Airtable
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { T, lister, creer, referentiels, lirePointage, F, envoyerErreur } from '../_lib/airtable.js';

async function agreger(hotelId, mois) {
  const refs = await referentiels();
  const pages = await lister(T.POINTAGES, {
    formule: `DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}'`,
  });
  const pointages = pages.map((p) => lirePointage(p, refs))
    .filter((p) => p.hotelId === hotelId && p.statut === 'Terminée' && p.duree);

  const parPrestation = new Map();
  for (const p of pointages) {
    const cle = p.prestation;
    if (!parPrestation.has(cle)) parPrestation.set(cle, { heures: 0, interventions: 0, tarif: p.tarifFacturation || 0 });
    const l = parPrestation.get(cle);
    l.heures += p.duree;
    l.interventions += 1;
  }
  const lignes = [...parPrestation.entries()].map(([prestation, l]) => ({
    prestation,
    heures: Math.round(l.heures * 100) / 100,
    interventions: l.interventions,
    tarif: l.tarif,
    montant: Math.round(l.heures * l.tarif * 100) / 100,
  }));
  const totalHT = Math.round(lignes.reduce((s, l) => s + l.montant, 0) * 100) / 100;
  const hotel = refs.iHotels[hotelId];
  return {
    hotel: hotel ? F(hotel, 'Nom') : '—',
    adresse: hotel ? F(hotel, 'Adresse') : '',
    mois, lignes, totalHT,
    nbPointages: pointages.length,
    tarifManquant: lignes.some((l) => !l.tarif),
    detail: pointages,
  };
}

function genererXlsx(agg) {
  const wb = XLSX.utils.book_new();
  const donnees = [
    ['FACTURE 5P STAR'],
    ['Hôtel', agg.hotel],
    ['Période', agg.mois],
    [],
    ['Prestation', 'Interventions', 'Heures', 'Tarif horaire (€)', 'Montant HT (€)'],
    ...agg.lignes.map((l) => [l.prestation, l.interventions, l.heures, l.tarif, l.montant]),
    [],
    ['', '', '', 'Total HT', agg.totalHT],
  ];
  const ws = XLSX.utils.aoa_to_sheet(donnees);
  ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Facture');
  const detail = [
    ['Salariée', 'Prestation', 'Date', 'Arrivée', 'Départ', 'Heures'],
    ...agg.detail.map((p) => [p.salarie, p.prestation, p.date, p.arrivee, p.depart, p.duree]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  ws2['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Détail des pointages');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function genererPdf(agg) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const bleu = rgb(0.24, 0.54, 0.81);
  const gris = rgb(0.42, 0.47, 0.53);
  let y = 780;
  const txt = (s, x, size = 10, f = font, c = rgb(0.12, 0.16, 0.21)) =>
    page.drawText(String(s ?? ''), { x, y, size, font: f, color: c });

  txt('5P STAR', 50, 24, bold, bleu);
  txt('Ensemble, faisons bon ménage !', 50, 9, font, gris); y -= 36;
  txt('FACTURE', 50, 16, bold); y -= 22;
  txt(`Hôtel : ${agg.hotel}`, 50, 11, bold); y -= 14;
  if (agg.adresse) { txt(agg.adresse, 50, 9, font, gris); y -= 14; }
  txt(`Période : ${agg.mois}`, 50, 10); y -= 26;

  page.drawRectangle({ x: 50, y: y - 4, width: 495, height: 18, color: bleu });
  const blanc = rgb(1, 1, 1);
  page.drawText('Prestation', { x: 56, y, size: 9, font: bold, color: blanc });
  page.drawText('Interv.', { x: 250, y, size: 9, font: bold, color: blanc });
  page.drawText('Heures', { x: 320, y, size: 9, font: bold, color: blanc });
  page.drawText('Tarif €/h', { x: 390, y, size: 9, font: bold, color: blanc });
  page.drawText('Montant HT', { x: 470, y, size: 9, font: bold, color: blanc });
  y -= 22;
  for (const l of agg.lignes) {
    txt(l.prestation, 56, 9.5);
    txt(l.interventions, 258, 9.5);
    txt(l.heures.toFixed(2), 322, 9.5);
    txt(l.tarif.toFixed(2), 394, 9.5);
    txt(l.montant.toFixed(2) + ' €', 472, 9.5, bold);
    y -= 15;
  }
  y -= 8;
  page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 0.5, color: gris });
  txt(`Total HT : ${agg.totalHT.toFixed(2)} €`, 400, 12, bold); y -= 30;
  txt('Document généré automatiquement — mentions légales (SIRET, TVA, règlement) à compléter.', 50, 7.5, font, gris);
  return Buffer.from(await doc.save());
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { hotelId, mois } = req.body || {};
      const agg = await agreger(hotelId, mois);
      if (!agg.nbPointages) return res.status(400).json({ error: 'Aucun pointage terminé sur cette période.' });
      await creer(T.CONSOLIDATIONS, {
        'Hôtel': [hotelId],
        'Mois': `${mois}-01`,
        'Total Facturé': agg.totalHT,
        'Détail des Prestations': agg.lignes.map((l) =>
          `${l.prestation} : ${l.heures} h × ${l.tarif} € = ${l.montant} €`).join('\n'),
        'Commentaires': `Générée le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} depuis le dashboard`,
      });
      return res.json({ ok: true, totalHT: agg.totalHT });
    }

    const { hotel, mois, format } = req.query;
    if (!hotel || !mois) return res.status(400).json({ error: 'Paramètres hotel et mois requis' });
    const agg = await agreger(hotel, mois);

    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="facture-${mois}.xlsx"`);
      return res.send(genererXlsx(agg));
    }
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="facture-${mois}.pdf"`);
      return res.send(await genererPdf(agg));
    }
    const { detail, ...sansDetail } = agg;
    res.json(sansDetail);
  } catch (err) { envoyerErreur(res, err); }
}
