// ── Gabarit commun aux documents 5P STAR ─────────────────────────────
// Identité de l'émetteur, repères de mise en page, primitives de dessin PDF
// et de composition Excel. Partagé par les factures hôtels et le suivi
// budgétaire salariés, pour que les deux portent la même charte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const EMETTEUR = {
  raison: 'SARL 5 P STAR - BATI NETIE',
  adresse: '36 Avenue Fréderic Joliot Curie',
  ville: '95140 Garges Lès Gonesse',
  siret: 'SIRET : 537 453 698 000 12 - Capital de 3 000 €uros',
  tel: 'Tél : 06 58 17 04 55',
  site: 'www.5pstar.com',
  mail: '5pstar@5pstar.com',
  naf: 'NAF 8122Z – TVA Fr 43537453698',
  modePaiement: 'Virement',
  rib: "Virement Bancaire : Relevé d'Identité Bancaire .",
  iban: 'IBAN : FR 56 3000 2011 5200 0007 2351 L54 .',
  bic: 'BIC SWIFT : CRLYFRPP .',
};

// Seul calcul ajouté par la mise en page : la TVA, absente du modèle de données
// mais présente sur le modèle de facture. Taux isolé ici pour être ajustable.
export const dateFr = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR') : '');
export const heureFr = (iso) => (iso
  ? new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
  : '');


export const MENTIONS_RETARD = [
  'Tout retard de paiment entraîne 3 fois le taux légal, conformément à l’article',
  'L.441-10 et D441-5 du Code de Commerce,',
  'des pénalités au taux BCE +10 points et indemnité forfaitaire de 40,00 € pour',
  'frais de recourvrement, sont dues par défaut de réglement le jour suivant de la',
  'date d’échéance qui figure sur la facture.',
];

export const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const moisEnClair = (mois) => {
  const [a, m] = mois.split('-').map(Number);
  return `${MOIS_FR[m - 1]} ${a}`;
};
/** « 16 Août 2026 » — la date exacte telle qu'elle figure sur la facture. */
export function dateLongue(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  const nom = MOIS_FR[Number(m) - 1] || '';
  return `${j} ${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${a}`;
}


/** « de septembre 2026 » ou « d'août 2026 », selon l'initiale du mois. */
export const periodeDe = (mois) => {
  const nom = moisEnClair(mois);
  return /^[aeiouâéêîôû]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
};


/** Nom de fichier sûr : sans accent ni espace (l'en-tête HTTP doit rester ASCII). */
export const slug = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'hotel';

/** Dernier jour du mois facturé — la facture et son échéance portent cette date. */
export const finDeMois = (mois) => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
};


export const NOIR = 'FF000000';
export const BLEU_PIED = 'FF2E74B5';

/** Bordures extérieures d'une plage « A1:C3 » (les cellules internes gardent les leurs). */
export function cadre(ws, plage, style = 'thin') {
  const [a, b] = plage.split(':');
  const c1 = ws.getCell(a);
  const c2 = ws.getCell(b || a);
  for (let r = c1.row; r <= c2.row; r++) {
    for (let c = c1.col; c <= c2.col; c++) {
      const cell = ws.getCell(r, c);
      const bord = { ...(cell.border || {}) };
      if (r === c1.row) bord.top = { style, color: { argb: NOIR } };
      if (r === c2.row) bord.bottom = { style, color: { argb: NOIR } };
      if (c === c1.col) bord.left = { style, color: { argb: NOIR } };
      if (c === c2.col) bord.right = { style, color: { argb: NOIR } };
      cell.border = bord;
    }
  }
}

/** Écrit une valeur dans une plage fusionnée et lui applique police et alignement. */
export function poser(ws, plage, valeur, { police = {}, align = {}, format } = {}) {
  if (plage.includes(':')) ws.mergeCells(plage);
  const cell = ws.getCell(plage.split(':')[0]);
  cell.value = valeur;
  cell.font = { name: 'Arial', size: 10, color: { argb: NOIR }, ...police };
  cell.alignment = { vertical: 'middle', ...align };
  if (format) cell.numFmt = format;
  return cell;
}

/** Une des cinq étiquettes du bandeau : intitulé au-dessus, valeur en dessous. */
export function boite(ws, colDebut, colFin, ligne, intitule, valeur) {
  const plage = (r) => (colDebut === colFin ? `${colDebut}${r}` : `${colDebut}${r}:${colFin}${r}`);
  const centre = { police: { bold: true, size: 11 }, align: { horizontal: 'center' } };
  poser(ws, plage(ligne), intitule, centre);
  poser(ws, plage(ligne + 1), valeur, centre);
  cadre(ws, `${colDebut}${ligne}:${colFin}${ligne + 1}`);
}

/** Logo de l'application, si le fichier est accessible depuis la fonction. */
export function chargerLogo() {
  try {
    const ici = path.dirname(fileURLToPath(import.meta.url));
    return fs.readFileSync(path.resolve(ici, '../../../public/logo.png'));
  } catch { return null; }
}

/** Le logo n'est embarqué qu'une fois par classeur, puis partagé entre les feuilles. */
export function logoDuClasseur(wb) {
  const buffer = chargerLogo();
  return buffer ? wb.addImage({ buffer, extension: 'png' }) : null;
}


export const P = {
  marge: 28,
  droite: 567,
  colQuantite: 320,      // début de la colonne « Quantité »
  colPrix: 380,          // début de « Prix unitaire HT »
  colTotal: 470,         // début de « Total HT »
};

// Les polices PDF standard utilisent WinAnsi : tout caractère hors de ce jeu
// ferait échouer l'encodage. Les noms d'hôtels et de prestations venant
// d'Airtable, on assainit systématiquement avant de dessiner.
export const HORS_WINANSI = /[^\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g;
export const winAnsi = (texte) => String(texte ?? '')
  .replace(/[   ]/g, ' ')
  .replace(/[•]/g, '-')
  .replace(HORS_WINANSI, '');

/** Découpe un texte pour qu'il tienne dans une largeur donnée. */
export function couperLignes(texte, police, taille, largeurMax) {
  const mots = winAnsi(texte).split(/\s+/).filter(Boolean);
  const lignes = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (police.widthOfTextAtSize(essai, taille) <= largeurMax) courante = essai;
    else { if (courante) lignes.push(courante); courante = mot; }
  }
  if (courante) lignes.push(courante);
  return lignes.length ? lignes : [''];
}

export const eur = (n) => (n ?? 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Polices et logo, embarqués une seule fois pour tout le document. */
export async function preparerPdf(doc) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try {
    const ici = path.dirname(fileURLToPath(import.meta.url));
    logo = await doc.embedPng(fs.readFileSync(path.resolve(ici, '../../../public/logo.png')));
  } catch { logo = null; }
  return { font, bold, logo };
}

/** Dessine une facture sur une nouvelle page, au gabarit validé. */

/** Identité de l'émetteur, répétée au bas de chaque page. */
export function piedDePage(page, { font }, info) {
  const BLEU = rgb(0.18, 0.45, 0.71);
  const NOIR = rgb(0, 0, 0);
  const largeur = (t, taille) => font.widthOfTextAtSize(winAnsi(t), taille);
  const ecrire = (t, x, y, taille = 9.5, couleur = BLEU) =>
    page.drawText(winAnsi(t), { x, y, size: taille, font, color: couleur });

  page.drawLine({ start: { x: P.marge, y: 58 }, end: { x: P.droite, y: 58 }, thickness: 1, color: NOIR });
  const pied = [
    [EMETTEUR.raison, EMETTEUR.tel],
    [EMETTEUR.adresse, EMETTEUR.site],
    [EMETTEUR.ville, EMETTEUR.mail],
    [EMETTEUR.siret, `${EMETTEUR.naf}   ${info.numero}/${info.total}`],
  ];
  pied.forEach(([gauche, droite], i) => {
    const yl = 45 - i * 12;
    ecrire(gauche, P.marge, yl);
    ecrire(droite, P.droite - largeur(droite, 9.5), yl);
  });
}



/** Outils de dessin liés à une page : tout le reste s'appuie dessus. */
export function outilsPdf(page, font, bold) {
  const noir = rgb(0, 0, 0);
  const bleu = rgb(0.18, 0.45, 0.71);
  const ecrire = (t, x, y, taille = 10, police = font, couleur = noir) =>
    page.drawText(winAnsi(t), { x, y, size: taille, font: police, color: couleur });
  const largeur = (t, taille, police = font) => police.widthOfTextAtSize(winAnsi(t), taille);
  return {
    NOIR: noir, BLEU: bleu, font, bold, ecrire, largeur,
    centrer: (t, x, l, y, taille = 10, police = font, couleur = noir) =>
      ecrire(t, x + (l - largeur(t, taille, police)) / 2, y, taille, police, couleur),
    aDroite: (t, xFin, y, taille = 10, police = font, couleur = noir) =>
      ecrire(t, xFin - largeur(t, taille, police), y, taille, police, couleur),
    cadre: (x, y, l, h, epaisseur = 1) =>
      page.drawRectangle({ x, y, width: l, height: h, borderColor: noir, borderWidth: epaisseur }),
    trait: (x1, y1, x2, y2, epaisseur = 0.8) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: epaisseur, color: noir }),
  };
}

/**
 * En-tête commun : logo, pavé de titre avec sa référence dessous, encadré
 * d'identité à droite, puis le bandeau d'étiquettes. Rend la charte identique
 * d'un document à l'autre.
 */
export function enTetePdf(page, o, { logo, titre, reference, bloc, cases }) {
  if (logo) {
    const l = 215;
    page.drawImage(logo, { x: P.marge, y: 672, width: l, height: l / (logo.width / logo.height) });
  } else {
    o.ecrire('5P STAR', P.marge, 715, 26, o.bold, o.BLEU);
  }

  o.cadre(432, 772, 135, 36, 1.6);
  o.centrer(titre, 432, 135, 784, 19, o.bold);
  if (reference) o.centrer(reference, 432, 135, 756, 13, o.bold);

  if (bloc) {
    o.cadre(285, 640, 282, 106);
    o.ecrire(bloc.titre, 295, 722, 11, o.bold);
    let y = 703;
    (bloc.lignes || []).slice(0, 3).forEach((part) => {
      couperLignes(part, o.font, 10.5, 262).forEach((t) => { o.ecrire(t, 295, y, 10.5); y -= 16; });
    });
  }

  const yBande = 578;
  const hBande = 44;
  let x = P.marge;
  for (const c of cases) {
    o.cadre(x, yBande, c.l, hBande);
    o.centrer(c.intitule, x, c.l, yBande + hBande - 16, 11, o.bold);
    o.centrer(c.valeur, x, c.l, yBande + 10, 11, o.bold);
    x += c.l + 4;
  }
}

/** Même en-tête, côté classeur : titre, référence, encadré, bandeau. */
export function enTeteExcel(ws, { titre, reference, bloc, cases }, idLogo) {
  if (idLogo != null) {
    ws.addImage(idLogo, { tl: { col: 0.2, row: 0.3 }, ext: { width: 250, height: 173 } });
  } else {
    poser(ws, 'A1:C3', '5P STAR', { police: { bold: true, size: 28 }, align: { horizontal: 'center' } });
  }
  for (let r = 1; r <= 7; r += 1) ws.getRow(r).height = 21;

  poser(ws, 'G1:H2', titre, { police: { bold: true, size: 20 }, align: { horizontal: 'center' } });
  cadre(ws, 'G1:H2', 'medium');
  if (reference) poser(ws, 'G3:H3', reference, { police: { bold: true, size: 13 }, align: { horizontal: 'center' } });

  if (bloc) {
    poser(ws, 'E4:H4', bloc.titre, { police: { bold: true, size: 11 } });
    (bloc.lignes || []).slice(0, 3).forEach((t, i) => poser(ws, `E${5 + i}:H${5 + i}`, t, { police: { size: 11 } }));
    for (let i = (bloc.lignes || []).length; i < 3; i += 1) poser(ws, `E${5 + i}:H${5 + i}`, '', {});
    cadre(ws, 'E4:H7');
  }

  ws.getRow(9).height = 20;
  ws.getRow(10).height = 20;
  for (const c of cases) boite(ws, c.debut, c.fin, 9, c.intitule, c.valeur);
}
