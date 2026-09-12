// Onglet Factures hôtels — heures réalisées × tarif horaire par prestation (tarif global)
// GET  ?hotel=recX&mois=AAAA-MM                → prévisualisation JSON
// GET  ?hotel=recX&mois=AAAA-MM&format=pdf|xlsx → export fichier
// POST { hotelId, mois }                        → enregistre la consolidation dans Airtable
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { T, lister, creer, referentiels, lirePointage, F, lien, nomOption, envoyerErreur } from '../airtable.js';
import { decoderDetail, lignesParJour, completerLignesAnciennes, referenceFacture, TVA_DEFAUT, CHAMP_CLIENT, PREFIXE_AVOIR } from './factures.js';
import { appliquerPause } from '../pause.js';
import {
  EMETTEUR, MENTIONS_RETARD, MOIS_FR, dateFr, heureFr, moisEnClair, dateLongue,
  periodeDe, slug, finDeMois, NOIR, BLEU_PIED, cadre, poser, boite,
  chargerLogo, logoDuClasseur, P, winAnsi, couperLignes, eur, preparerPdf,
  piedDePage, outilsPdf, enTetePdf, enTeteExcel,
} from './gabarit.js';


// ── Coordonnées de l'émetteur, reprises telles quelles du modèle de facture ──
const TAUX_TVA = TVA_DEFAUT;

/** Repères d'en-tête : valeurs figées de la facture, sinon valeurs déduites du mois. */
const enTete = (agg) => ({
  numero: agg.numero || '',
  codeClient: agg.codeClient || '',
  emission: agg.dateEmission ? dateFr(agg.dateEmission) : finDeMois(agg.mois),
  // Un avoir ne s'échoit pas : c'est nous qui devons, pas le client. Afficher
  // une échéance ferait croire à une somme à régler.
  echeance: estAvoir(agg) ? '—'
    : (agg.dateEcheance ? dateFr(agg.dateEcheance) : finDeMois(agg.mois)),
  taux: agg.tauxTVA ?? TAUX_TVA,
});

/**
 * Libellé d'une ligne : « 16 Août 2026 - Femme de chambre x 2 ».
 * Le « x N » indique le nombre de personnes intervenues ce jour-là sur la
 * même prestation ; leurs heures sont cumulées dans la quantité.
 */
function libelleLigne(l) {
  const base = l.date ? `${dateLongue(l.date)} - ${l.prestation}` : l.prestation;
  return (l.intervenants || 1) > 1 ? `${base} x ${l.intervenants}` : base;
}

/** Intitulé du bloc : la prestation si elle est unique, sinon un libellé générique. */
function intitulePrestations(agg) {
  const types = [...new Set((agg.lignes || []).map((l) => l.prestation))];
  const quoi = types.length === 1 ? types[0] : 'Prestations';
  return `${quoi} pour la période ${periodeDe(agg.mois)}`;
}

/** Adresse éclatée en lignes, comme sur le modèle (rue, puis code postal et ville). */
// Un montant négatif n'est pas une facture : c'est un avoir. Le pavé de titre
// doit le dire, sinon le client reçoit une « FACTURE » de -1 240 € et ne sait
// pas s'il doit payer ou être remboursé.
// La base s'est ouverte aux copropriétés et aux cabinets : « Hôtel : » serait
// faux sur la facture de PFA. Le type du client le dit quand il est renseigné.
const etiquetteClient = (agg) => `${agg.typeClient || 'Client'} :`;

const libelleNet = (agg) => (estAvoir(agg) ? 'Net  à  rembourser' : 'Net  à  payer');

/**
 * Un document est un avoir si son numéro est de la série A, si son statut le
 * dit, ou si son montant est négatif. Les trois signaux, parce qu'ils ne
 * coïncident pas toujours : les avoirs posés à la main avant que l'avoir soit
 * une vraie pièce portent le statut « Avoir » avec un montant POSITIF, et
 * sortiraient sous un pavé « FACTURE » si l'on ne regardait que le signe.
 */
const estAvoir = (agg) => String(agg.numero || '').startsWith(PREFIXE_AVOIR)
  || String(agg.statut || '').toLowerCase() === 'avoir'
  || (agg.totalHT ?? 0) < 0;

const titreDocument = (agg) => (estAvoir(agg) ? 'AVOIR' : 'FACTURE');

const lignesAdresse = (agg) => String(agg.adresse || '').split(',').map((x) => x.trim()).filter(Boolean);

async function agreger(hotelId, mois) {
  const refs = await referentiels();
  const pages = await lister(T.POINTAGES, {
    formule: `DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${mois}'`,
  });
  const pointages = pages.map((p) => lirePointage(p, refs))
    .filter((p) => p.hotelId === hotelId && p.statut === 'Terminée' && p.duree);

  // Même granularité que la facture définitive : une ligne par jour et par
  // prestation, avec le nombre d'intervenants de la journée. Et la même pause,
  // sans quoi l'aperçu annoncerait un montant que la facture ne tiendrait pas.
  const hotel = refs.iHotels[hotelId];
  const lignes = lignesParJour(appliquerPause(pointages, F(hotel, 'Pause déduite (minutes)') || 0));
  const totalHT = Math.round(lignes.reduce((s, l) => s + l.montant, 0) * 100) / 100;
  return {
    hotel: hotel ? F(hotel, 'Nom') : '—',
    typeClient: hotel ? nomOption(F(hotel, 'Type de client')) : null,
    adresse: adresseComplete(hotel),
    mois, lignes, totalHT,
    nbPointages: pointages.length,
    tarifManquant: lignes.some((l) => !l.tarif),
    detail: pointages,
  };
}

// ═══════════════ Export Excel — gabarit repris du modèle de facture ═══════════════
// Grille de 8 colonnes : A-E portent la description et les mentions, F-H les
// colonnes chiffrées. Les encadrés du modèle sont rendus par des bordures.
/** Pose une facture complète sur une feuille du classeur, au gabarit validé. */
function ajouterFeuilleFacture(wb, agg, nomFeuille, idLogo) {
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

  // ── En-tête : logo, pavé « FACTURE », bloc client ──
  if (idLogo != null) {
    ws.addImage(idLogo, { tl: { col: 0.2, row: 0.3 }, ext: { width: 250, height: 173 } });
  } else {
    poser(ws, 'A1:C3', '5P STAR', { police: { bold: true, size: 28 }, align: { horizontal: 'center' } });
  }
  for (let r = 1; r <= 7; r++) ws.getRow(r).height = 21;

  const e = enTete(agg);
  poser(ws, 'G1:H2', titreDocument(agg), { police: { bold: true, size: 20 }, align: { horizontal: 'center' } });
  cadre(ws, 'G1:H2', 'medium');
  // Le numéro se lit juste sous le titre, plutôt que noyé dans le bandeau.
  poser(ws, 'G3:H3', e.numero, { police: { bold: true, size: 13 }, align: { horizontal: 'center' } });

  poser(ws, 'E4:H4', agg.hotel, { police: { bold: true, size: 11 } });
  const adresseClient = lignesAdresse(agg);
  poser(ws, 'E5:H5', adresseClient[0] || '', { police: { size: 11 } });
  poser(ws, 'E6:H6', adresseClient[1] || '', { police: { size: 11 } });
  poser(ws, 'E7:H7', adresseClient.slice(2).join(', '), { police: { size: 11 } });
  cadre(ws, 'E4:H7');

  // ── Bandeau des cinq étiquettes ──
  ws.getRow(9).height = 20;
  ws.getRow(10).height = 20;
  boite(ws, 'A', 'B', 9, 'Mode  paiement', EMETTEUR.modePaiement);
  boite(ws, 'C', 'D', 9, 'Date', e.emission);
  boite(ws, 'E', 'F', 9, 'Code  client', e.codeClient);
  boite(ws, 'G', 'H', 9, 'Date  échéance', e.echeance);

  // ── Corps : en-têtes de colonnes ──
  const rEnTete = 12;
  ws.getRow(rEnTete).height = 20;
  poser(ws, `A${rEnTete}:E${rEnTete}`, 'Description', { police: { bold: true, size: 12 }, align: { horizontal: 'center' } });
  poser(ws, `F${rEnTete}`, 'Quantité', { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  poser(ws, `G${rEnTete}`, 'Prix  unitaire  HT', { police: { bold: true, size: 11 }, align: { horizontal: 'center', wrapText: true } });
  poser(ws, `H${rEnTete}`, 'Total  HT', { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  cadre(ws, `A${rEnTete}:E${rEnTete}`);
  cadre(ws, `F${rEnTete}`);
  cadre(ws, `G${rEnTete}`);
  cadre(ws, `H${rEnTete}`);

  // ── Corps : rappel du chantier puis lignes de prestation ──
  let r = rEnTete + 1;
  const ligneTexte = (texte, police = {}) => {
    poser(ws, `A${r}:E${r}`, texte, { police });
    r += 1;
  };
  poser(ws, `A${r}:E${r}`, `${etiquetteClient(agg)}   ${agg.hotel}`, { police: { underline: false } });
  r += 1;
  for (const part of lignesAdresse(agg)) ligneTexte(`             ${part}`);
  ligneTexte('');
  ligneTexte(intitulePrestations(agg), { bold: true });
  ligneTexte('');

  const rPremiereLigne = r;
  for (const l of agg.lignes) {
    poser(ws, `A${r}:E${r}`, libelleLigne(l));
    poser(ws, `F${r}`, l.heures, { align: { horizontal: 'right' }, format: EURO });
    poser(ws, `G${r}`, l.tarif, { align: { horizontal: 'right' }, format: EURO });
    poser(ws, `H${r}`, l.montant, { align: { horizontal: 'right' }, format: EURO });
    r += 1;
  }
  if (!agg.lignes.length) ligneTexte('Aucune prestation terminée sur cette période.');

  // Le modèle laisse le cadre respirer : on complète jusqu'à une hauteur fixe.
  const rDerniere = Math.max(r, rPremiereLigne + 14);
  for (; r <= rDerniere; r += 1) poser(ws, `A${r}:E${r}`, '');

  // Cadre du corps : un encadré par colonne, sans filets horizontaux internes.
  const rFin = rDerniere;
  cadre(ws, `A${rEnTete + 1}:E${rFin}`);
  cadre(ws, `F${rEnTete + 1}:F${rFin}`);
  cadre(ws, `G${rEnTete + 1}:G${rFin}`);
  cadre(ws, `H${rEnTete + 1}:H${rFin}`);

  // ── Récapitulatif TVA et totaux ──
  const totalTVA = Math.round(agg.totalHT * e.taux * 100) / 100;
  const totalTTC = Math.round((agg.totalHT + totalTVA) * 100) / 100;
  const rTva = rFin + 2;
  ws.getRow(rTva).height = 19;
  ws.getRow(rTva + 1).height = 19;

  const enTeteTotaux = (ref, texte) =>
    poser(ws, ref, texte, { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  const valeurTotaux = (ref, valeur, gras = false) =>
    poser(ws, ref, valeur, { police: { bold: gras, size: 11 }, align: { horizontal: 'right' }, format: EURO });

  enTeteTotaux(`E${rTva}`, 'Total  HT');
  enTeteTotaux(`F${rTva}`, `TVA  ${(e.taux * 100).toFixed(0)} %`);
  enTeteTotaux(`G${rTva}`, 'Total  TTC');
  enTeteTotaux(`H${rTva}`, 'Déjà  réglé  TTC');
  valeurTotaux(`E${rTva + 1}`, agg.totalHT, true);
  valeurTotaux(`F${rTva + 1}`, totalTVA, true);
  valeurTotaux(`G${rTva + 1}`, totalTTC, true);
  poser(ws, `H${rTva + 1}`, '', {});
  ['E', 'F', 'G', 'H'].forEach((c) => { cadre(ws, `${c}${rTva}`); cadre(ws, `${c}${rTva + 1}`); });

  // ── Net à payer ──
  const rNet = rTva + 3;
  ws.getRow(rNet).height = 19;
  ws.getRow(rNet + 1).height = 19;
  poser(ws, `G${rNet}:H${rNet}`, libelleNet(agg), { police: { bold: true, size: 12 }, align: { horizontal: 'center' } });
  poser(ws, `G${rNet + 1}:H${rNet + 1}`, totalTTC, { police: { bold: true, size: 12 }, align: { horizontal: 'right' }, format: EURO });
  cadre(ws, `G${rNet}:H${rNet}`);
  cadre(ws, `G${rNet + 1}:H${rNet + 1}`);

  // ── Mentions légales et coordonnées bancaires ──
  const rMentions = rNet + 3;
  poser(ws, `A${rMentions}:D${rMentions}`, 'Retard de Paiement:', { police: { bold: true, size: 8 } });
  MENTIONS_RETARD.forEach((ligne, i) => {
    poser(ws, `A${rMentions + 1 + i}:D${rMentions + 1 + i}`, ligne, { police: { size: 8 } });
  });

  poser(ws, `E${rMentions}:H${rMentions}`, 'MODE  DE  REGLEMENT', { police: { bold: true, size: 11 }, align: { horizontal: 'center' } });
  poser(ws, `E${rMentions + 1}:H${rMentions + 1}`, EMETTEUR.rib, { police: { size: 10 }, align: { horizontal: 'right' } });
  poser(ws, `E${rMentions + 2}:H${rMentions + 2}`, EMETTEUR.iban, { police: { size: 10 }, align: { horizontal: 'right' } });
  poser(ws, `E${rMentions + 3}:H${rMentions + 3}`, EMETTEUR.bic, { police: { size: 10 }, align: { horizontal: 'right' } });

  // ── Pied de page : identité de l'émetteur ──
  const rPied = rMentions + 6;
  ws.getRow(rPied - 1).border = undefined;
  const pied = (ref, texte, align = 'left') =>
    poser(ws, ref, texte, { police: { size: 10, color: { argb: BLEU_PIED } }, align: { horizontal: align } });
  pied(`A${rPied}:D${rPied}`, EMETTEUR.raison);
  pied(`A${rPied + 1}:D${rPied + 1}`, EMETTEUR.adresse);
  pied(`A${rPied + 2}:D${rPied + 2}`, EMETTEUR.ville);
  pied(`A${rPied + 3}:D${rPied + 3}`, EMETTEUR.siret);
  pied(`E${rPied}:H${rPied}`, EMETTEUR.tel, 'right');
  pied(`E${rPied + 1}:H${rPied + 1}`, EMETTEUR.site, 'right');
  pied(`E${rPied + 2}:H${rPied + 2}`, `✉ : ${EMETTEUR.mail}`, 'right');
  pied(`E${rPied + 3}:H${rPied + 3}`, EMETTEUR.naf, 'right');
  // Filet de séparation au-dessus du pied, comme sur le modèle.
  for (let c = 1; c <= 8; c += 1) {
    const cell = ws.getCell(rPied, c);
    cell.border = { ...(cell.border || {}), top: { style: 'thin', color: { argb: NOIR } } };
  }

  ws.pageSetup.printArea = `A1:H${rPied + 3}`;
  return ws;
}

/** Annexe justificative : les pointages qui ont produit la facture. */
function ajouterFeuilleDetail(wb, agg, nomFeuille) {
  const EURO = '#,##0.00';
  const wd = wb.addWorksheet(nomFeuille, { views: [{ state: 'frozen', ySplit: 1 }] });
  wd.columns = [
    { header: 'Salariée', key: 'salarie', width: 22 },
    { header: 'Prestation', key: 'prestation', width: 26 },
    { header: 'Date', key: 'date', width: 13 },
    { header: 'Arrivée', key: 'arrivee', width: 11 },
    { header: 'Départ', key: 'depart', width: 11 },
    { header: 'Heures', key: 'heures', width: 10 },
  ];
  wd.getRow(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  wd.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E74B5' } };
  wd.getRow(1).alignment = { vertical: 'middle' };
  wd.getRow(1).height = 20;
  for (const p of agg.detail) {
    wd.addRow({
      salarie: p.salarie, prestation: p.prestation, date: dateFr(p.date),
      arrivee: heureFr(p.arrivee), depart: heureFr(p.depart), heures: p.duree,
    });
  }
  wd.getColumn('heures').numFmt = EURO;
  wd.autoFilter = { from: 'A1', to: `F${agg.detail.length + 1}` };
  return wd;
}

/** Classeur d'une facture : le document, puis son annexe. */
async function genererXlsx(agg) {
  const wb = new ExcelJS.Workbook();
  wb.creator = EMETTEUR.raison;
  ajouterFeuilleFacture(wb, agg, 'Facture', logoDuClasseur(wb));
  ajouterFeuilleDetail(wb, agg, 'Détail des pointages');
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ═══════════════ Export PDF — même gabarit que l'export Excel ═══════════════
// Page A4 (595 × 842 pt). Les encadrés du modèle sont dessinés au trait ; les
// repères ci-dessous décrivent la grille une fois pour toutes.
const H_LIGNE_PDF = 14;

/**
 * Dessine une facture, sur autant de pages que nécessaire. Un hôtel nettoyé
 * tous les jours produit une trentaine de lignes : le cadre du modèle n'en
 * tient qu'une vingtaine, il faut donc savoir passer à la page suivante.
 */
function dessinerFacture(doc, agg, ressources) {
  const lignes = agg.lignes || [];
  const hUtile = 540 - 232 - 20;
  const hRappel = (1 + lignesAdresse(agg).length) * 15 + 36;   // hôtel, adresse, titre
  const capPremiere = Math.max(1, Math.floor((hUtile - hRappel) / H_LIGNE_PDF));
  const capSuivante = Math.max(1, Math.floor(hUtile / H_LIGNE_PDF));

  const reste = lignes.slice();
  const lots = [reste.splice(0, capPremiere)];
  while (reste.length) lots.push(reste.splice(0, capSuivante));

  lots.forEach((lot, i) => dessinerPage(doc, agg, ressources, lot, {
    premiere: i === 0, derniere: i === lots.length - 1, numero: i + 1, total: lots.length,
  }));
}

function dessinerPage(doc, agg, { font, bold, logo }, lot, info) {
  const page = doc.addPage([595, 842]);
  const NOIR = rgb(0, 0, 0);
  const BLEU = rgb(0.18, 0.45, 0.71);

  const ecrire = (texte, x, y, taille = 10, police = font, couleur = NOIR) =>
    page.drawText(winAnsi(texte), { x, y, size: taille, font: police, color: couleur });
  const largeur = (texte, taille, police = font) => police.widthOfTextAtSize(winAnsi(texte), taille);
  const centrer = (texte, x, l, y, taille = 10, police = font, couleur = NOIR) =>
    ecrire(texte, x + (l - largeur(texte, taille, police)) / 2, y, taille, police, couleur);
  const aDroite = (texte, xFin, y, taille = 10, police = font, couleur = NOIR) =>
    ecrire(texte, xFin - largeur(texte, taille, police), y, taille, police, couleur);
  const cadre = (x, y, l, h, epaisseur = 1) =>
    page.drawRectangle({ x, y, width: l, height: h, borderColor: NOIR, borderWidth: epaisseur });
  const trait = (x1, y1, x2, y2, epaisseur = 0.8) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: epaisseur, color: NOIR });

  // ── Logo, pavé FACTURE, bloc client ──
  if (logo) {
    const l = 215;
    page.drawImage(logo, { x: P.marge, y: 672, width: l, height: l / (logo.width / logo.height) });
  } else {
    ecrire('5P STAR', P.marge, 715, 26, bold, BLEU);
  }

  const e = enTete(agg);
  cadre(432, 772, 135, 36, 1.6);
  centrer(titreDocument(agg), 432, 135, 784, 19, bold);
  // Le numéro se lit juste sous le titre, plutôt que noyé dans le bandeau.
  if (e.numero) centrer(e.numero, 432, 135, 756, 13, bold);

  cadre(285, 640, 282, 106);
  ecrire(agg.hotel, 295, 722, 11, bold);
  let yClient = 703;
  lignesAdresse(agg).slice(0, 3).forEach((part) => {
    couperLignes(part, font, 10.5, 262).forEach((t) => { ecrire(t, 295, yClient, 10.5); yClient -= 16; });
  });

  // ── Bandeau des cinq étiquettes ──
  const yBande = 578;
  const hBande = 44;
  const cases = [
    { l: 188, intitule: 'Mode  paiement', valeur: EMETTEUR.modePaiement },
    { l: 104, intitule: 'Date', valeur: e.emission },
    { l: 124, intitule: 'Code  client', valeur: e.codeClient },
    { l: 111, intitule: 'Date  échéance', valeur: e.echeance },
  ];
  let x = P.marge;
  for (const c of cases) {
    cadre(x, yBande, c.l, hBande);
    centrer(c.intitule, x, c.l, yBande + hBande - 16, 11, bold);
    centrer(c.valeur, x, c.l, yBande + 10, 11, bold);
    x += c.l + 4;
  }

  // ── En-têtes du tableau ──
  const yEnTete = 540;
  const hEnTete = 22;
  cadre(P.marge, yEnTete, P.colQuantite - P.marge, hEnTete);
  cadre(P.colQuantite, yEnTete, P.colPrix - P.colQuantite, hEnTete);
  cadre(P.colPrix, yEnTete, P.colTotal - P.colPrix, hEnTete);
  cadre(P.colTotal, yEnTete, P.droite - P.colTotal, hEnTete);
  centrer('Description', P.marge, P.colQuantite - P.marge, yEnTete + 7, 12, bold);
  centrer('Quantité', P.colQuantite, P.colPrix - P.colQuantite, yEnTete + 7, 10, bold);
  centrer('Prix unitaire HT', P.colPrix, P.colTotal - P.colPrix, yEnTete + 7, 10, bold);
  centrer('Total  HT', P.colTotal, P.droite - P.colTotal, yEnTete + 7, 10.5, bold);

  // ── Corps : rappel de l'hôtel, puis une ligne par jour ──
  const yCorpsHaut = yEnTete;          // le corps est collé sous l'en-tête
  const yCorpsBas = 232;
  let y = yCorpsHaut - 20;
  const largeurDesc = P.colQuantite - P.marge - 16;

  if (info.premiere) {
    const etiquette = etiquetteClient(agg);
    ecrire(etiquette, P.marge + 8, y, 10.5, bold);
    trait(P.marge + 8, y - 2.5, P.marge + 8 + largeur(etiquette, 10.5, bold), y - 2.5, 0.8);
    ecrire(agg.hotel, P.marge + 58, y, 10.5);
    y -= 15;
    for (const part of lignesAdresse(agg)) {
      couperLignes(part, font, 10.5, largeurDesc - 50).forEach((t) => { ecrire(t, P.marge + 58, y, 10.5); y -= 15; });
    }
    y -= 12;
    ecrire(intitulePrestations(agg), P.marge + 8, y, 10.5);
    y -= 24;
  }

  for (const l of lot) {
    couperLignes(libelleLigne(l), font, 10.5, largeurDesc)
      .forEach((t, i) => ecrire(t, P.marge + 8, y - i * 12, 10.5));
    // Une ligne au forfait n'a ni quantité ni prix unitaire : eur(null) rendrait
    // « 0,00 » à côté d'un montant de 540 €, ce qui se lit comme une erreur.
    if (l.heures != null) aDroite(eur(l.heures), P.colPrix - 10, y, 10.5);
    if (l.tarif != null) aDroite(eur(l.tarif), P.colTotal - 10, y, 10.5);
    aDroite(eur(l.montant), P.droite - 10, y, 10.5);
    y -= H_LIGNE_PDF;
  }
  if (info.premiere && !lot.length) ecrire('Aucune prestation terminée sur cette période.', P.marge + 8, y, 10.5);

  // Cadre du corps : une colonne par filet vertical, sans filets horizontaux.
  const hCorps = yCorpsHaut - yCorpsBas;
  cadre(P.marge, yCorpsBas, P.colQuantite - P.marge, hCorps);
  cadre(P.colQuantite, yCorpsBas, P.colPrix - P.colQuantite, hCorps);
  cadre(P.colPrix, yCorpsBas, P.colTotal - P.colPrix, hCorps);
  cadre(P.colTotal, yCorpsBas, P.droite - P.colTotal, hCorps);

  // Les pages intermédiaires ne portent ni totaux ni mentions légales : une
  // facture ne se solde qu'une fois, sur sa dernière page.
  if (!info.derniere) {
    aDroite(`Suite page ${info.numero + 1} sur ${info.total}`, P.droite, 210, 10, bold);
    piedDePage(page, { font, bold }, info);
    return;
  }

  // ── Récapitulatif TVA et totaux ──
  const totalTVA = Math.round(agg.totalHT * e.taux * 100) / 100;
  const totalTTC = Math.round((agg.totalHT + totalTVA) * 100) / 100;
  const yTva = 186;
  const hCase = 21;
  const tableau = (depart, colonnes, valeurs, grasValeurs = false) => {
    let xc = depart;
    colonnes.forEach((col, i) => {
      cadre(xc, yTva + hCase, col.l, hCase);
      cadre(xc, yTva, col.l, hCase);
      centrer(col.t, xc, col.l, yTva + hCase + 6, 10.5, bold);
      if (valeurs[i] !== null) aDroite(valeurs[i], xc + col.l - 7, yTva + 6, 10.5, grasValeurs ? bold : font);
      xc += col.l;
    });
  };
  const tauxLisible = `${(e.taux * 100).toFixed(0)} %`;
  tableau(190, [
    { t: 'Total HT', l: 92 }, { t: `TVA ${tauxLisible}`, l: 92 },
    { t: 'Total TTC', l: 92 }, { t: 'Déjà réglé TTC', l: 101 },
  ], [eur(agg.totalHT), eur(totalTVA), eur(totalTTC), null], true);

  // ── Net à payer ──
  const yNet = 124;
  cadre(432, yNet + hCase, 135, hCase);
  cadre(432, yNet, 135, hCase);
  centrer(libelleNet(agg), 432, 135, yNet + hCase + 6, 11.5, bold);
  aDroite(eur(totalTTC), 560, yNet + 6, 11.5, bold);

  // ── Mentions de retard et coordonnées bancaires ──
  ecrire('Retard de Paiement:', P.marge, 112, 7.5, bold);
  MENTIONS_RETARD.forEach((ligne, i) => ecrire(ligne, P.marge, 102 - i * 9.5, 7.5));

  const titreReglement = 'MODE  DE  REGLEMENT';
  aDroite(titreReglement, P.droite, 110, 11, bold);
  trait(P.droite - largeur(titreReglement, 11, bold), 107, P.droite, 107, 0.8);
  aDroite(EMETTEUR.rib, P.droite, 95, 10);
  aDroite(EMETTEUR.iban, P.droite, 82, 10);
  aDroite(EMETTEUR.bic, P.droite, 69, 10);

  piedDePage(page, { font, bold }, info);
}

/** Nom de feuille Excel : unique, 31 caractères maximum, sans caractère interdit. */
function nomFeuille(agg, pris) {
  let base = (agg.numero || agg.hotel || 'Facture').replace(/[\\/?*\[\]:]/g, '-').slice(0, 28);
  let nom = base;
  let n = 2;
  while (pris.has(nom)) nom = `${base.slice(0, 26)}-${n++}`;
  pris.add(nom);
  return nom;
}

/** Toutes les factures du mois dans un classeur : récapitulatif puis une feuille chacune. */
async function genererXlsxGroupe(aggs, mois) {
  const wb = new ExcelJS.Workbook();
  wb.creator = EMETTEUR.raison;
  const EURO = '#,##0.00';

  const recap = wb.addWorksheet('Récapitulatif', { views: [{ state: 'frozen', ySplit: 5 }] });
  recap.columns = [
    { width: 12 }, { width: 32 }, { width: 12 }, { width: 15 },
    { width: 14 }, { width: 13 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 14 },
  ];
  recap.getCell('A1').value = 'RÉCAPITULATIF DE FACTURATION — 5P STAR';
  recap.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
  recap.getCell('A2').value = 'Période';
  recap.getCell('B2').value = moisEnClair(mois);
  recap.getCell('A3').value = 'Factures';
  recap.getCell('B3').value = aggs.length;

  const entetes = ['Numéro', 'Hôtel', 'Catégorie', 'Période', 'Total HT', 'TVA', 'Total TTC', 'Émission', 'Échéance', 'Statut'];
  recap.getRow(5).values = entetes;
  recap.getRow(5).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  recap.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E74B5' } };
  recap.getRow(5).height = 20;

  let totalHT = 0;
  let totalTVA = 0;
  for (const a of aggs) {
    const tva = Math.round(a.totalHT * (a.tauxTVA ?? TVA_DEFAUT) * 100) / 100;
    totalHT += a.totalHT;
    totalTVA += tva;
    recap.addRow([
      a.numero, a.hotel, a.categorie || '—', moisEnClair(a.mois),
      a.totalHT, tva, Math.round((a.totalHT + tva) * 100) / 100,
      a.dateEmission ? dateFr(a.dateEmission) : '', a.dateEcheance ? dateFr(a.dateEcheance) : '',
      a.statut || '',
    ]);
  }
  const rTotal = recap.rowCount + 1;
  recap.getRow(rTotal).values = ['TOTAL', '', '', '',
    Math.round(totalHT * 100) / 100, Math.round(totalTVA * 100) / 100,
    Math.round((totalHT + totalTVA) * 100) / 100];
  recap.getRow(rTotal).font = { name: 'Arial', size: 10, bold: true };
  ['E', 'F', 'G'].forEach((c) => { recap.getColumn(c).numFmt = EURO; });
  recap.autoFilter = { from: 'A5', to: `J${rTotal - 1}` };

  const idLogo = logoDuClasseur(wb);
  const pris = new Set(['Récapitulatif']);
  for (const a of aggs) ajouterFeuilleFacture(wb, a, nomFeuille(a, pris), idLogo);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Toutes les factures du mois dans un seul PDF, une page chacune. */
async function genererPdfGroupe(aggs) {
  const doc = await PDFDocument.create();
  const ressources = await preparerPdf(doc);
  for (const agg of aggs) dessinerFacture(doc, agg, ressources);
  return Buffer.from(await doc.save());
}

/** Document d'une seule facture. */
async function genererPdf(agg) {
  const doc = await PDFDocument.create();
  dessinerFacture(doc, agg, await preparerPdf(doc));
  return Buffer.from(await doc.save());
}

/** Adresse postale complète de l'hôtel, code postal et ville compris. */
function adresseComplete(hotel) {
  if (!hotel) return '';
  const cp = F(hotel, 'Code postal') || '';
  const ville = F(hotel, 'Ville') || '';
  return [F(hotel, 'Adresse') || '', [cp, ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

/** Jeu d'export d'une facture enregistrée, sans son annexe de pointages. */
function aggDepuisEnregistrement(rec, refs) {
  const hotel = refs.iHotels[lien(rec, CHAMP_CLIENT)];
  return {
    hotel: hotel ? F(hotel, 'Nom') : '—',
    adresse: adresseComplete(hotel),
    mois: (F(rec, 'Mois facturé') || '').slice(0, 7),
    lignes: decoderDetail(F(rec, 'Détail des prestations')),
    totalHT: F(rec, 'Total HT') || 0,
    nbPointages: (F(rec, 'Pointages sources') || []).length,
    tarifManquant: false,
    detail: [],
    numero: referenceFacture(rec),
    codeClient: hotel ? F(hotel, 'Code client') || '' : '',
    categorie: hotel ? nomOption(F(hotel, 'Catégorie')) : null,
    typeClient: hotel ? nomOption(F(hotel, 'Type de client')) : null,
    statut: nomOption(F(rec, 'Statut')) || '',
    dateEmission: F(rec, "Date d'émission") || null,
    dateEcheance: F(rec, "Date d'échéance") || null,
    tauxTVA: F(rec, 'Taux TVA') ?? TVA_DEFAUT,
  };
}

/**
 * Toutes les factures d'un mois, dans l'ordre des numéros.
 * Les factures annulées sont écartées : on ne renvoie pas au client, ni au
 * comptable, un document qui n'a plus de valeur.
 */
async function aggsDuMois(mois) {
  const refs = await referentiels();
  const recs = await lister(T.FACTURES, {
    formule: `DATETIME_FORMAT({Mois facturé}, 'YYYY-MM') = '${mois}'`,
  });
  const gardees = recs.filter((r) => nomOption(F(r, 'Statut')) !== 'Annulée');
  const aggs = gardees.map((r) => ({ ...aggDepuisEnregistrement(r, refs), id: r.id }));
  // Rétablit les dates des factures antérieures au détail journalier.
  await completerLignesAnciennes(aggs, gardees);
  return aggs.sort((a, b) => String(a.numero || '').localeCompare(String(b.numero || '')));
}

/**
 * Reconstruit le jeu de données d'export à partir d'une facture enregistrée.
 * Les montants viennent de l'instantané figé, jamais d'un nouveau calcul :
 * une facture déjà envoyée ne doit pas bouger si un pointage est corrigé.
 * Seule l'annexe « détail des pointages » relit les pointages liés, à titre
 * justificatif.
 */
async function aggDepuisFacture(factureId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(factureId)) {
    const e = new Error('Identifiant de facture invalide.'); e.status = 400; throw e;
  }
  const [rec] = await lister(T.FACTURES, { formule: `RECORD_ID() = '${factureId}'` });
  if (!rec) { const e = new Error('Facture introuvable.'); e.status = 404; throw e; }

  const refs = await referentiels();
  const ids = F(rec, 'Pointages sources') || [];
  let detail = [];
  if (ids.length) {
    const source = await lister(T.POINTAGES, {
      formule: `OR(${ids.map((i) => `RECORD_ID()='${i}'`).join(',')})`,
    });
    detail = source.map((p) => lirePointage(p, refs));
  }
  const agg = { ...aggDepuisEnregistrement(rec, refs), detail, nbPointages: detail.length };

  // Facture émise avant le détail journalier : ses lignes n'ont pas de date.
  // On les reconstruit depuis les pointages déjà chargés, et seulement si la
  // somme retombe sur le total figé — une facture émise ne change pas de
  // montant parce qu'un pointage a bougé depuis.
  if (agg.lignes.length && agg.lignes.every((l) => !l.date) && detail.length) {
    const lignes = lignesParJour(detail.filter((p) => p.duree));
    const total = Math.round(lignes.reduce((s, l) => s + (l.montant || 0), 0) * 100) / 100;
    if (lignes.length && Math.abs(total - (agg.totalHT || 0)) < 0.01) agg.lignes = lignes;
  }
  return agg;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { hotelId, mois } = req.body || {};
      const agg = await agreger(hotelId, mois);
      if (!agg.nbPointages) return res.status(400).json({ error: 'Aucun pointage terminé sur cette période.' });
      await creer(T.CONSOLIDATIONS, {
        [CHAMP_CLIENT]: [hotelId],
        'Mois': `${mois}-01`,
        'Total Facturé': agg.totalHT,
        'Détail des Prestations': agg.lignes.map((l) =>
          `${l.prestation} : ${l.heures} h × ${l.tarif} € = ${l.montant} €`).join('\n'),
        'Commentaires': `Générée le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} depuis le dashboard`,
      });
      return res.json({ ok: true, totalHT: agg.totalHT });
    }

    const { hotel, mois, format, facture, groupe } = req.query;

    // ── Export de fin de mois : toutes les factures émises en un seul fichier ──
    if (groupe) {
      if (!/^\d{4}-\d{2}$/.test(mois || '')) return res.status(400).json({ error: 'Mois requis (AAAA-MM).' });
      const aggs = await aggsDuMois(mois);
      if (!aggs.length) return res.status(404).json({ error: 'Aucune facture émise sur ce mois.' });
      const nomGroupe = `factures-${mois}`;
      if (format === 'xlsx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${nomGroupe}.xlsx"`);
        return res.send(await genererXlsxGroupe(aggs, mois));
      }
      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nomGroupe}.pdf"`);
        return res.send(await genererPdfGroupe(aggs));
      }
      return res.status(400).json({ error: 'Format inconnu.' });
    }

    // Deux sources possibles : une facture déjà émise (figée), ou une
    // prévisualisation calculée pour un hôtel dont la facture n'existe pas encore.
    let agg;
    if (facture) {
      agg = await aggDepuisFacture(facture);
    } else {
      if (!hotel || !mois) return res.status(400).json({ error: 'Paramètres hotel et mois requis' });
      agg = await agreger(hotel, mois);
    }

    // Un seul hôtel par document : son nom figure dans le fichier pour que
    // plusieurs factures d'un même mois ne s'écrasent pas au téléchargement.
    // Intitulé demandé : numéro de facture - mois facturé - année sur 2 chiffres.
    const nomFichier = agg.numero && agg.mois
      ? `${agg.numero}-${agg.mois.slice(5, 7)}-${agg.mois.slice(2, 4)}`
      : `facture-${slug(agg.hotel)}-${agg.mois}`;
    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}.xlsx"`);
      return res.send(await genererXlsx(agg));
    }
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}.pdf"`);
      return res.send(await genererPdf(agg));
    }
    const { detail, ...sansDetail } = agg;
    res.json(sansDetail);
  } catch (err) { envoyerErreur(res, err); }
}
