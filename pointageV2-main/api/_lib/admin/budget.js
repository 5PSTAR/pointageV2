// Onglet Budget salariés — rémunération : heures × taux horaire salarié.
// GET  ?mois=AAAA-MM                            → JSON consolidé { lignes, total }
// GET  ?mois=AAAA-MM&format=xlsx|pdf            → export consolidé (toutes les salariées)
// GET  ?mois=AAAA-MM&salarie=recX&format=xlsx|pdf → export individuel (une seule salariée)
// POST { mois }                                 → enregistre chaque ligne dans Facturation Salariés
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { T, lister, creer, referentiels, lirePointage, envoyerErreur } from '../airtable.js';
import { appliquerPauseParClient } from '../pause.js';
import {
  EMETTEUR, dateFr, heureFr, moisEnClair, dateLongue, slug, eur, P,
  cadre, poser, logoDuClasseur, preparerPdf, outilsPdf, enTetePdf,
  enTeteExcel, piedDePage, couperLignes,
} from './gabarit.js';

const arrondi = (n) => Math.round(n * 100) / 100;

/**
 * Agrège les pointages terminés d'un mois, groupés par salarié.
 * `salarieId` restreint le calcul à une seule salariée (exports individuels).
 */
async function agreger(mois, salarieId) {
  const refs = await referentiels();
  const pages = await lister(T.POINTAGES, {
    formule: `DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}'`,
  });
  let pointages = pages.map((p) => lirePointage(p, refs))
    .filter((p) => p.statut === 'Terminée' && p.duree);
  if (salarieId) pointages = pointages.filter((p) => p.salarieId === salarieId);
  // La pause n'est pas payée non plus : ce que le client ne règle pas, la
  // salariée ne le travaille pas. Même règle, même seuil, même journée.
  pointages = appliquerPauseParClient(pointages, refs);
  pointages.sort((a, b) => String(a.date).localeCompare(String(b.date)));

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
    heures: arrondi(l.heures),
    cout: arrondi(l.heures * l.taux),
    prestations: [...l.prestations.entries()].map(([nom, h]) => `${nom} : ${arrondi(h)} h`).join(' · '),
  })).sort((a, b) => a.salarie.localeCompare(b.salarie));

  return {
    mois,
    salarieId: salarieId || null,
    lignes,
    total: arrondi(lignes.reduce((s, l) => s + l.cout, 0)),
    totalHeures: arrondi(lignes.reduce((s, l) => s + l.heures, 0)),
    tauxManquant: lignes.some((l) => !l.taux),
    detail: pointages,
  };
}

// ═══════════ Documents — même charte que les factures hôtels ═══════════
const coutLigne = (p) => arrondi((p.duree || 0) * (p.tauxHoraireSalarie || 0));
const fmtHeures = (h) => `${(h ?? 0).toFixed(2).replace('.', ',')} h`;

/**
 * Lignes du document : une par intervention sur un état individuel, une par
 * salariée sur le consolidé. Même grille que la facture — description à
 * gauche, quantité, prix unitaire, total.
 */
function lignesDocument(agg) {
  if (agg.salarieId) {
    return agg.detail.map((p) => ({
      libelle: `${dateLongue(p.date)} - ${p.hotel} - ${p.prestation}`
        + (p.pauseMinutes ? `  (pause ${p.pauseMinutes} min déduite)` : ''),
      quantite: p.duree,
      unitaire: p.tauxHoraireSalarie || 0,
      total: coutLigne(p),
    }));
  }
  return agg.lignes.map((l) => ({
    libelle: `${l.salarie}   (${l.interventions} intervention${l.interventions > 1 ? 's' : ''})`,
    quantite: l.heures,
    unitaire: l.taux,
    total: l.cout,
  }));
}

const LARGEURS_CASES = [188, 104, 124, 111];
const COLONNES_CASES = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H']];

/** Repères d'en-tête, déclinés pour le PDF et pour le classeur. */
function enTeteDocument(agg) {
  const individuel = Boolean(agg.salarieId);
  const l = agg.lignes[0] || {};
  const paires = individuel
    ? [
      ['Période', moisEnClair(agg.mois)],
      ['Taux  horaire', `${eur(l.taux)} €`],
      ['Heures', fmtHeures(l.heures)],
      ['À  payer', `${eur(l.cout)} €`],
    ]
    : [
      ['Période', moisEnClair(agg.mois)],
      ['Salariées', String(agg.lignes.length)],
      ['Heures', fmtHeures(agg.totalHeures)],
      ['Coût  total', `${eur(agg.total)} €`],
    ];
  return {
    titre: individuel ? 'RÉMUNÉRATION' : 'BUDGET',
    reference: moisEnClair(agg.mois).toUpperCase(),
    bloc: individuel
      ? { titre: l.salarie, lignes: [`${eur(l.taux)} € de l'heure`, `${l.interventions} intervention(s)`] }
      : { titre: '5P STAR — Équipe de ménage', lignes: [`${agg.lignes.length} salariée(s)`, fmtHeures(agg.totalHeures)] },
    intitule: individuel
      ? `Heures pointées ${agg.mois ? `en ${moisEnClair(agg.mois)}` : ''}`
      : `Récapitulatif de l'équipe — ${moisEnClair(agg.mois)}`,
    cases: paires.map(([intitule, valeur], k) => ({ l: LARGEURS_CASES[k], intitule, valeur })),
    casesExcel: paires.map(([intitule, valeur], k) => ({
      debut: COLONNES_CASES[k][0], fin: COLONNES_CASES[k][1], intitule, valeur,
    })),
    individuel,
  };
}

const NOTE_BAS = [
  'Document interne, établi à partir des pointages terminés du mois.',
  'Les heures reprennent celles enregistrées par l’application de pointage ;',
  'le taux horaire est celui porté à la fiche de la salariée.',
];

// ── Excel ─────────────────────────────────────────────────────────────
function ajouterFeuilleBudget(wb, agg, nomFeuille, idLogo) {
  const ws = wb.addWorksheet(nomFeuille, {
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 11 }, { width: 15 }, { width: 15 }, { width: 13 },
    { width: 13 }, { width: 12 }, { width: 17 }, { width: 16 },
  ];
  const EURO = '#,##0.00';
  const e = enTeteDocument(agg);
  enTeteExcel(ws, { titre: e.titre, reference: e.reference, bloc: e.bloc, cases: e.casesExcel }, idLogo);

  // ── En-têtes de colonnes ──
  const rEnTete = 12;
  ws.getRow(rEnTete).height = 20;
  poser(ws, `A${rEnTete}:E${rEnTete}`, 'Description', { police: { bold: true, size: 12 }, align: { horizontal: 'center' } });
  poser(ws, `F${rEnTete}`, 'Heures', { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  poser(ws, `G${rEnTete}`, 'Taux horaire', { police: { bold: true, size: 11 }, align: { horizontal: 'center', wrapText: true } });
  poser(ws, `H${rEnTete}`, 'Montant', { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  ['A:E', 'F', 'G', 'H'].forEach((c) => cadre(ws, c.includes(':')
    ? `A${rEnTete}:E${rEnTete}` : `${c}${rEnTete}`));

  // ── Corps ──
  let r = rEnTete + 1;
  const ligneTexte = (texte, police = {}) => { poser(ws, `A${r}:E${r}`, texte, { police }); r += 1; };
  if (e.individuel) {
    poser(ws, `A${r}:E${r}`, `Salariée :   ${agg.lignes[0].salarie}`, {});
    r += 1;
  } else {
    poser(ws, `A${r}:E${r}`, 'Équipe :   toutes les salariées du mois', {});
    r += 1;
  }
  ligneTexte('');
  ligneTexte(e.intitule, { bold: true });
  ligneTexte('');

  const rPremiere = r;
  for (const l of lignesDocument(agg)) {
    poser(ws, `A${r}:E${r}`, l.libelle);
    poser(ws, `F${r}`, l.quantite, { align: { horizontal: 'right' }, format: EURO });
    poser(ws, `G${r}`, l.unitaire, { align: { horizontal: 'right' }, format: EURO });
    poser(ws, `H${r}`, l.total, { align: { horizontal: 'right' }, format: EURO });
    r += 1;
  }
  const rDerniere = Math.max(r, rPremiere + 14);
  for (; r <= rDerniere; r += 1) poser(ws, `A${r}:E${r}`, '');

  const rFin = rDerniere;
  cadre(ws, `A${rEnTete + 1}:E${rFin}`);
  cadre(ws, `F${rEnTete + 1}:F${rFin}`);
  cadre(ws, `G${rEnTete + 1}:G${rFin}`);
  cadre(ws, `H${rEnTete + 1}:H${rFin}`);

  // ── Totaux : pas de TVA sur une rémunération ──
  const rTot = rFin + 2;
  ws.getRow(rTot).height = 19;
  ws.getRow(rTot + 1).height = 19;
  const totalHeures = e.individuel ? agg.lignes[0].heures : agg.totalHeures;
  const totalMontant = e.individuel ? agg.lignes[0].cout : agg.total;
  poser(ws, `E${rTot}`, 'Total  heures', { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  poser(ws, `F${rTot}:G${rTot}`, 'Montant  total', { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  poser(ws, `E${rTot + 1}`, totalHeures, { police: { bold: true, size: 11 }, align: { horizontal: 'right' }, format: EURO });
  poser(ws, `F${rTot + 1}:G${rTot + 1}`, totalMontant, { police: { bold: true, size: 11 }, align: { horizontal: 'right' }, format: EURO });
  ['E', 'F'].forEach((c) => { cadre(ws, `${c}${rTot}`); cadre(ws, `${c}${rTot + 1}`); });
  cadre(ws, `F${rTot}:G${rTot}`);
  cadre(ws, `F${rTot + 1}:G${rTot + 1}`);

  // ── Note et pied de page ──
  const rNote = rTot + 3;
  NOTE_BAS.forEach((t, i) => poser(ws, `A${rNote + i}:E${rNote + i}`, t, { police: { size: 8 } }));

  const rPied = rNote + NOTE_BAS.length + 2;
  const pied = (ref, texte, align = 'left') =>
    poser(ws, ref, texte, { police: { size: 10, color: { argb: 'FF2E74B5' } }, align: { horizontal: align } });
  pied(`A${rPied}:D${rPied}`, EMETTEUR.raison);
  pied(`A${rPied + 1}:D${rPied + 1}`, EMETTEUR.adresse);
  pied(`A${rPied + 2}:D${rPied + 2}`, EMETTEUR.ville);
  pied(`A${rPied + 3}:D${rPied + 3}`, EMETTEUR.siret);
  pied(`E${rPied}:H${rPied}`, EMETTEUR.tel, 'right');
  pied(`E${rPied + 1}:H${rPied + 1}`, EMETTEUR.site, 'right');
  pied(`E${rPied + 2}:H${rPied + 2}`, `✉ : ${EMETTEUR.mail}`, 'right');
  pied(`E${rPied + 3}:H${rPied + 3}`, EMETTEUR.naf, 'right');
  for (let c = 1; c <= 8; c += 1) {
    const cell = ws.getCell(rPied, c);
    cell.border = { ...(cell.border || {}), top: { style: 'thin', color: { argb: 'FF000000' } } };
  }
  ws.pageSetup.printArea = `A1:H${rPied + 3}`;
  return ws;
}

async function genererXlsx(agg) {
  const wb = new ExcelJS.Workbook();
  wb.creator = EMETTEUR.raison;
  ajouterFeuilleBudget(wb, agg, agg.salarieId ? 'Rémunération' : 'Budget salariés', logoDuClasseur(wb));

  // Annexe : le détail des pointages qui justifie les heures.
  const wd = wb.addWorksheet('Détail des pointages', { views: [{ state: 'frozen', ySplit: 1 }] });
  wd.columns = [
    { header: 'Salariée', key: 'salarie', width: 22 },
    { header: 'Hôtel', key: 'hotel', width: 26 },
    { header: 'Prestation', key: 'prestation', width: 22 },
    { header: 'Date', key: 'date', width: 13 },
    { header: 'Arrivée', key: 'arrivee', width: 11 },
    { header: 'Départ', key: 'depart', width: 11 },
    { header: 'Pause', key: 'pause', width: 9 },
    { header: 'Heures', key: 'heures', width: 10 },
    { header: 'Taux', key: 'taux', width: 10 },
    { header: 'Montant', key: 'montant', width: 12 },
  ];
  wd.getRow(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  wd.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E74B5' } };
  wd.getRow(1).height = 20;
  for (const p of agg.detail) {
    wd.addRow({
      salarie: p.salarie, hotel: p.hotel, prestation: p.prestation, date: dateFr(p.date),
      arrivee: heureFr(p.arrivee), depart: heureFr(p.depart),
      pause: p.pauseMinutes ? `${p.pauseMinutes} min` : '', heures: p.duree,
      taux: p.tauxHoraireSalarie || 0, montant: coutLigne(p),
    });
  }
  ['heures', 'taux', 'montant'].forEach((k) => { wd.getColumn(k).numFmt = '#,##0.00'; });
  wd.autoFilter = { from: 'A1', to: `J${agg.detail.length + 1}` };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── PDF ───────────────────────────────────────────────────────────────
const H_LIGNE = 14;

async function genererPdf(agg) {
  const doc = await PDFDocument.create();
  const ressources = await preparerPdf(doc);
  const lignes = lignesDocument(agg);

  // Un mois complet peut dépasser le cadre : on répartit sur plusieurs pages.
  const hUtile = 540 - 232 - 20;
  const capPremiere = Math.max(1, Math.floor((hUtile - 66) / H_LIGNE));
  const capSuivante = Math.max(1, Math.floor(hUtile / H_LIGNE));
  const reste = lignes.slice();
  const lots = [reste.splice(0, capPremiere)];
  while (reste.length) lots.push(reste.splice(0, capSuivante));

  lots.forEach((lot, i) => dessinerPage(doc, agg, ressources, lot, {
    premiere: i === 0, derniere: i === lots.length - 1, numero: i + 1, total: lots.length,
  }));
  return Buffer.from(await doc.save());
}

function dessinerPage(doc, agg, { font, bold, logo }, lot, info) {
  const page = doc.addPage([595, 842]);
  const o = outilsPdf(page, font, bold);
  const e = enTeteDocument(agg);

  enTetePdf(page, o, { logo, titre: e.titre, reference: e.reference, bloc: e.bloc, cases: e.cases });

  // ── En-têtes du tableau ──
  const yEnTete = 540;
  const hEnTete = 22;
  o.cadre(P.marge, yEnTete, P.colQuantite - P.marge, hEnTete);
  o.cadre(P.colQuantite, yEnTete, P.colPrix - P.colQuantite, hEnTete);
  o.cadre(P.colPrix, yEnTete, P.colTotal - P.colPrix, hEnTete);
  o.cadre(P.colTotal, yEnTete, P.droite - P.colTotal, hEnTete);
  o.centrer('Description', P.marge, P.colQuantite - P.marge, yEnTete + 7, 12, bold);
  o.centrer('Heures', P.colQuantite, P.colPrix - P.colQuantite, yEnTete + 7, 10, bold);
  o.centrer('Taux horaire', P.colPrix, P.colTotal - P.colPrix, yEnTete + 7, 10, bold);
  o.centrer('Montant', P.colTotal, P.droite - P.colTotal, yEnTete + 7, 10.5, bold);

  // ── Corps ──
  const yCorpsBas = 232;
  let y = yEnTete - 20;
  const largeurDesc = P.colQuantite - P.marge - 16;

  if (info.premiere) {
    const etiquette = e.individuel ? 'Salariée :' : 'Équipe :';
    o.ecrire(etiquette, P.marge + 8, y, 10.5, bold);
    o.trait(P.marge + 8, y - 2.5, P.marge + 8 + o.largeur(etiquette, 10.5, bold), y - 2.5, 0.8);
    o.ecrire(e.individuel ? agg.lignes[0].salarie : 'toutes les salariées du mois', P.marge + 68, y, 10.5);
    y -= 27;
    o.ecrire(e.intitule, P.marge + 8, y, 10.5);
    y -= 24;
  }

  for (const l of lot) {
    couperLignes(l.libelle, font, 10.5, largeurDesc).forEach((t, i) => o.ecrire(t, P.marge + 8, y - i * 12, 10.5));
    o.aDroite(eur(l.quantite), P.colPrix - 10, y, 10.5);
    o.aDroite(eur(l.unitaire), P.colTotal - 10, y, 10.5);
    o.aDroite(eur(l.total), P.droite - 10, y, 10.5);
    y -= H_LIGNE;
  }
  if (info.premiere && !lot.length) o.ecrire('Aucune heure pointée sur cette période.', P.marge + 8, y, 10.5);

  const hCorps = yEnTete - yCorpsBas;
  o.cadre(P.marge, yCorpsBas, P.colQuantite - P.marge, hCorps);
  o.cadre(P.colQuantite, yCorpsBas, P.colPrix - P.colQuantite, hCorps);
  o.cadre(P.colPrix, yCorpsBas, P.colTotal - P.colPrix, hCorps);
  o.cadre(P.colTotal, yCorpsBas, P.droite - P.colTotal, hCorps);

  if (!info.derniere) {
    o.aDroite(`Suite page ${info.numero + 1} sur ${info.total}`, P.droite, 210, 10, bold);
    piedDePage(page, { font }, info);
    return;
  }

  // ── Totaux : une rémunération ne porte pas de TVA ──
  const totalHeures = e.individuel ? agg.lignes[0].heures : agg.totalHeures;
  const totalMontant = e.individuel ? agg.lignes[0].cout : agg.total;
  const yTot = 186;
  const hCase = 21;
  let xc = 283;
  [{ t: 'Total heures', l: 130, v: fmtHeures(totalHeures) },
    { t: 'Montant total', l: 154, v: `${eur(totalMontant)} €` }].forEach((col) => {
    o.cadre(xc, yTot + hCase, col.l, hCase);
    o.cadre(xc, yTot, col.l, hCase);
    o.centrer(col.t, xc, col.l, yTot + hCase + 6, 10.5, bold);
    o.aDroite(col.v, xc + col.l - 7, yTot + 6, 10.5, bold);
    xc += col.l;
  });

  const yNet = 124;
  o.cadre(432, yNet + hCase, 135, hCase);
  o.cadre(432, yNet, 135, hCase);
  o.centrer('Net  à  payer', 432, 135, yNet + hCase + 6, 11.5, bold);
  o.aDroite(`${eur(totalMontant)} €`, 560, yNet + 6, 11.5, bold);

  o.ecrire('Récapitulatif :', P.marge, 112, 7.5, bold);
  NOTE_BAS.forEach((t, i) => o.ecrire(t, P.marge, 102 - i * 9.5, 7.5));

  piedDePage(page, { font }, info);
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

    const { mois, format, salarie } = req.query;
    if (!mois) return res.status(400).json({ error: 'Paramètre mois requis' });
    if (salarie && !/^rec[A-Za-z0-9]{14}$/.test(salarie)) {
      return res.status(400).json({ error: 'Identifiant salarié invalide.' });
    }

    // Le JSON reste toujours consolidé : le front a besoin de la liste complète
    // pour alimenter son sélecteur. `salarie` ne restreint que les exports.
    const agg = await agreger(mois, format ? salarie : undefined);

    if (!format) {
      const { detail, ...sansDetail } = agg;
      return res.json(sansDetail);
    }
    if (!agg.lignes.length) {
      return res.status(404).json({
        error: salarie
          ? 'Aucun pointage terminé pour cette salariée sur ce mois.'
          : 'Aucun pointage terminé sur ce mois.',
      });
    }

    const nom = agg.salarieId
      ? `remuneration-${slug(agg.lignes[0].salarie)}-${mois}`
      : `budget-salaries-${mois}`;

    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nom}.xlsx"`);
      return res.send(await genererXlsx(agg));
    }
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nom}.pdf"`);
      return res.send(await genererPdf(agg));
    }
    return res.status(400).json({ error: 'Format inconnu.' });
  } catch (err) { envoyerErreur(res, err); }
}
