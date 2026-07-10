// Onglet Budget salariés — coût mensuel : heures × taux horaire salarié, consolidé
// GET ?mois=AAAA-MM                → JSON { lignes, total }
// GET ?mois=AAAA-MM&format=pdf|xlsx → export fichier
// POST { mois }                     → enregistre chaque ligne dans Facturation Salariés
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { T, lister, creer, referentiels, lirePointage, F, envoyerErreur } from '../_lib/airtable.js';

async function agreger(mois) {
  const refs = await referentiels();
  const pages = await lister(T.POINTAGES, {
    formule: `DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}'`,
  });
  const pointages = pages.map((p) => lirePointage(p, refs))
    .filter((p) => p.statut === 'Terminée' && p.duree);

  const parSalarie = new Map();
  for (const p of pointages) {
    if (!parSalarie.has(p.salarieId)) {
      parSalarie.set(p.salarieId, {
        salarieId: p.salarieId, salarie: p.salarie,
        taux: p.tauxHoraireSalarie || 0,
        heures: 0, interventions: 0,
        prestations: new Map(), pointageIds: [],
      });
    }
    const l = parSalarie.get(p.salarieId);
    l.heures += p.duree;
    l.interventions += 1;
    l.pointageIds.push(p.id);
    l.prestations.set(p.prestation, (l.prestations.get(p.prestation) || 0) + p.duree);
  }
  const lignes = [...parSalarie.values()].map((l) => ({
    ...l,
    heures: Math.round(l.heures * 100) / 100,
    cout: Math.round(l.heures * l.taux * 100) / 100,
    prestations: [...l.prestations.entries()].map(([nom, h]) =>
      `${nom} : ${Math.round(h * 100) / 100} h`).join(' · '),
  })).sort((a, b) => a.salarie.localeCompare(b.salarie));
  const total = Math.round(lignes.reduce((s, l) => s + l.cout, 0) * 100) / 100;
  const totalHeures = Math.round(lignes.reduce((s, l) => s + l.heures, 0) * 100) / 100;
  return { mois, lignes, total, totalHeures, tauxManquant: lignes.some((l) => !l.taux), detail: pointages };
}

function genererXlsx(agg) {
  const wb = XLSX.utils.book_new();
  const donnees = [
    ['SUIVI BUDGÉTAIRE SALARIÉS — 5P STAR'],
    ['Mois', agg.mois],
    [],
    ['Salariée', 'Interventions', 'Heures', 'Taux horaire (€)', 'Coût (€)', 'Détail prestations'],
    ...agg.lignes.map((l) => [l.salarie, l.interventions, l.heures, l.taux, l.cout, l.prestations]),
    [],
    ['TOTAL', '', agg.totalHeures, '', agg.total, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(donnees);
  ws['!cols'] = [{ wch: 22 }, { wch: 13 }, { wch: 9 }, { wch: 15 }, { wch: 12 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Budget salariés');
  const detail = [
    ['Salariée', 'Hôtel', 'Prestation', 'Date', 'Heures', 'Taux', 'Coût'],
    ...agg.detail.map((p) => [p.salarie, p.hotel, p.prestation, p.date, p.duree,
      p.tauxHoraireSalarie || 0, Math.round((p.duree || 0) * (p.tauxHoraireSalarie || 0) * 100) / 100]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  XLSX.utils.book_append_sheet(wb, ws2, 'Détail des pointages');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function genererPdf(agg) {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const vert = rgb(0.57, 0.74, 0.28);
  const gris = rgb(0.42, 0.47, 0.53);
  let y = 780;
  const txt = (s, x, size = 10, f = font, c = rgb(0.12, 0.16, 0.21)) =>
    page.drawText(String(s ?? ''), { x, y, size, font: f, color: c });

  txt('5P STAR', 50, 24, bold, vert);
  txt('Suivi budgétaire salariés', 50, 9, font, gris); y -= 34;
  txt(`Mois : ${agg.mois}`, 50, 12, bold); y -= 24;

  page.drawRectangle({ x: 50, y: y - 4, width: 495, height: 18, color: vert });
  const blanc = rgb(1, 1, 1);
  page.drawText('Salariée', { x: 56, y, size: 9, font: bold, color: blanc });
  page.drawText('Interv.', { x: 240, y, size: 9, font: bold, color: blanc });
  page.drawText('Heures', { x: 305, y, size: 9, font: bold, color: blanc });
  page.drawText('Taux €/h', { x: 380, y, size: 9, font: bold, color: blanc });
  page.drawText('Coût', { x: 480, y, size: 9, font: bold, color: blanc });
  y -= 22;
  for (const l of agg.lignes) {
    if (y < 90) { page = doc.addPage([595, 842]); y = 780; }
    txt(l.salarie, 56, 9.5);
    txt(l.interventions, 248, 9.5);
    txt(l.heures.toFixed(2), 308, 9.5);
    txt(l.taux.toFixed(2), 386, 9.5);
    txt(l.cout.toFixed(2) + ' €', 476, 9.5, bold);
    y -= 15;
  }
  y -= 8;
  page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 0.5, color: gris });
  txt(`Total consolidé : ${agg.total.toFixed(2)} €  (${agg.totalHeures.toFixed(2)} h)`, 320, 12, bold);
  return Buffer.from(await doc.save());
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { mois } = req.body || {};
      const agg = await agreger(mois);
      if (!agg.lignes.length) return res.status(400).json({ error: 'Aucun pointage terminé sur ce mois.' });
      for (const l of agg.lignes) {
        await creer(T.FACTU_SALARIES, {
          'Salarié': [l.salarieId],
          'Mois': `${mois}-01`,
          'Heures Travaillées': l.heures,
          'Taux Horaire': l.taux,
          'Pointages Sources': l.pointageIds.slice(0, 100),
          'Commentaires': `Consolidation générée le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
        });
      }
      return res.json({ ok: true, lignes: agg.lignes.length, total: agg.total });
    }

    const { mois, format } = req.query;
    if (!mois) return res.status(400).json({ error: 'Paramètre mois requis' });
    const agg = await agreger(mois);
    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="budget-salaries-${mois}.xlsx"`);
      return res.send(genererXlsx(agg));
    }
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="budget-salaries-${mois}.pdf"`);
      return res.send(await genererPdf(agg));
    }
    const { detail, ...sansDetail } = agg;
    res.json(sansDetail);
  } catch (err) { envoyerErreur(res, err); }
}
