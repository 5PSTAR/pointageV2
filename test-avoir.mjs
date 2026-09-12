// Avoir et numérotation. Le scénario de référence : une facture partie chez le
// client, corrigée par un avoir, ne doit jamais gonfler le chiffre d'affaires.
process.env.AIRTABLE_TOKEN = 'faux';

const T = { SAL: 'tbl12XOxlZk1xFy5W', HOT: 'tbltHWrjqtIT8wn3I', PRE: 'tbl63cY9itn3Lk1Ar', PTG: 'tbl1srurt2A2Ges03', FAC: 'tblqw9ieeljA8iPb7', REL: 'tblaxyhAkr7BFBYcC' };
let base, seq;

const facture = (id, numero, champs) => ({ id, fields: {
  // « Numéro » ne porte plus que le rang : 1, 14, 30. La référence imprimée
  // (F26-014, A26-001) se construit à la lecture, depuis le statut et l'année.
  'Numéro': numero,
  'Client': ['recCLIENT00000001'],
  'Mois facturé': '2026-09-01',
  'Total HT': 1240, 'Taux TVA': 0.2, "Date d'émission": '2026-09-30', "Date d'échéance": '2026-10-30',
  'Détail des prestations': '2026-09-16 | Femme de chambre | x2 | 11.5 h | 22.5 €/h | 258.75 € | #12 #13',
  ...champs } });

function reinit() {
  seq = 0;
  base = {
    [T.SAL]: [], [T.PTG]: [], [T.REL]: [],
    [T.PRE]: [{ id: 'recPRESTATION0001', fields: { 'Type de prestation': 'Femme de chambre', 'Tarif 3 étoiles': 22.5 } }],
    [T.HOT]: [{ id: 'recCLIENT00000001', fields: { Nom: 'Hôtel Concorde', 'Catégorie': '3 étoiles', 'Délai de paiement (jours)': 30 } }],
    [T.FAC]: [],
  };
}

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const [, , , table, recId] = u.pathname.split('/');
  const m = options.method || 'GET';
  const corps = options.body ? JSON.parse(options.body) : null;
  const ok = (d) => ({ ok: true, status: 200, json: async () => d });

  if (m === 'POST') { seq += 1; const r = { id: `recNEW${String(seq).padStart(11, '0')}`, fields: corps.fields }; base[table].push(r); return ok(r); }
  if (m === 'PATCH') { const r = base[table].find((x) => x.id === recId); r.fields = { ...r.fields, ...corps.fields }; return ok(r); }
  if (recId) return ok(base[table].find((x) => x.id === recId) || null);

  const formule = u.searchParams.get('filterByFormula') || '';
  let rs = base[table];
  const parId = formule.match(/RECORD_ID\(\) = '([^']+)'/);
  if (parId) rs = rs.filter((r) => r.id === parId[1]);
  const parRef = formule.match(/\{Référence document\} = '([^']+)'/);
  if (parRef) rs = rs.filter((r) => r.fields['Référence document'] === parRef[1]);
  return ok({ records: rs });
};

const { default: handler } = await import('./api/_lib/admin/factures.js');
const res = () => { const r = { code: 200, corps: null }; r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; }; r.json = (d) => { r.corps = d; return r; }; r.send = (d) => { r.corps = d; return r; }; return r; };
const appel = async (req) => { const r = res(); await handler({ headers: {}, query: {}, ...req }, r); return r; };
const avoir = (id) => appel({ method: 'PATCH', body: { id, action: 'avoir' } });

let ko = 0;
const V = (t, c, d = '') => { if (!c) ko += 1; console.log(`  ${c ? '✅' : '❌'} ${t}${d ? `  → ${d}` : ''}`); };
const { referenceFacture, decoderDetail } = await import('./api/_lib/admin/factures.js');
const fac = (ref) => base[T.FAC].find((x) => referenceFacture(x) === ref);

// ═══ 1 — Le scénario du comptable ═══
reinit();
base[T.FAC].push(facture('recFACTURE0000001', 14, { 'Statut': 'Envoyée', "Date d'envoi": '2026-09-30' }));
console.log('\n① Facture de 1 240 € envoyée, puis corrigée par un avoir');
let r = await avoir('recFACTURE0000001');
V('avoir émis', r.code === 200 && r.corps.ok, r.corps.error || r.corps.numero);
const a = fac(r.corps.numero);
V('c\'est un enregistrement NOUVEAU', base[T.FAC].length === 2);
V('référence de la série AVOIR', /^A26-\d{3}$/.test(referenceFacture(a)), referenceFacture(a));
// Le champ « Numéro » est un texte côté Airtable : le rang s'y écrit en texte.
// Ce qui compte est qu'il ne porte QUE le rang, plus la référence entière.
V('Airtable ne stocke que le rang', /^\d+$/.test(String(a.fields['Numéro'])), JSON.stringify(a.fields['Numéro']));
V('montant négatif', a.fields['Total HT'] === -1240, `${a.fields['Total HT']} €`);
console.log('   DEBUG avoir :', JSON.stringify(a.fields));
console.log('   DEBUG origine :', JSON.stringify(base[T.FAC].find((x) => x.id === 'recFACTURE0000001').fields));
V('même client', a.fields['Client']?.[0] === 'recCLIENT00000001');
V('même mois facturé', a.fields['Mois facturé'] === '2026-09-01');
V('même taux de TVA', a.fields['Taux TVA'] === 0.2);
V('renvoi croisé vers la facture', a.fields['Référence document'] === 'F26-014', a.fields['Référence document']);
V('lignes reprises en négatif', /-258\.75 €/.test(a.fields['Détail des prestations']), a.fields['Détail des prestations'].slice(0, 70));

console.log('\n② La facture d\'origine n\'est pas touchée');
const o = fac('F26-014');
V('statut inchangé', o.fields['Statut'] === 'Envoyée', o.fields['Statut']);
V('montant inchangé', o.fields['Total HT'] === 1240);
V('date d\'envoi inchangée', o.fields["Date d'envoi"] === '2026-09-30');
V('la trace de l\'avoir est ajoutée', /Avoir A26-\d{3} émis le/.test(o.fields['Commentaires'] || ''), (o.fields['Commentaires'] || '').slice(0, 46));

console.log('\n③ Le chiffre d\'affaires ne double plus');
base[T.FAC].push(facture('recFACTURE0000002', 16, { 'Statut': 'Envoyée', "Date d'envoi": '2026-10-02', 'Total HT': 1180 }));
r = await appel({ method: 'GET', query: { periode: 'mois', mois: '2026-09' } });
const emises = r.corps.lignes.filter((l) => l.id);
V('3 pièces sur le mois', emises.length === 3, emises.map((l) => `${l.numero}:${l.totalHT}`).join(' '));
V('l\'avoir porte bien un numéro en A', emises.some((l) => /^A26-/.test(l.numero)), emises.map((l) => l.numero).join(' '));
V('total facturé = 1 180 €, pas 2 420 €', r.corps.totalFacture.ht === 1180, `${r.corps.totalFacture.ht} €`);

console.log('\n④ Les refus');
r = await avoir('recFACTURE0000001');
V('pas deux avoirs sur la même facture', r.code === 409, r.corps.error);
base[T.FAC].push(facture('recFACTURE0000003', 20, { 'Statut': 'Brouillon' }));
r = await avoir('recFACTURE0000003');
V('pas d\'avoir sur un brouillon', r.code === 409, r.corps.error);
r = await avoir('recABSENTE0000001');
V('facture introuvable', r.code === 404, r.corps.error);

// ═══ 5 — Numérotation ═══
console.log('\n⑤ La numérotation ne réattribue jamais un numéro vivant');
reinit();
base[T.FAC].push(facture('recFACTURE0000001', 1, { 'Statut': 'Envoyée', "Date d'envoi": '2026-09-30' }));
base[T.FAC].push(facture('recFACTURE0000002', 2, { 'Statut': 'Annulée' }));
r = await avoir('recFACTURE0000001');
// Le rang vient du NUMÉRO DE LIGNE : il est unique dans toute la table, donc
// partagé entre factures et avoirs. C'est le prix de l'absence de collision.
V('rang suivant, toutes séries confondues', r.corps.numero === 'A26-003', r.corps.numero);
V('aucun rang n\'est réattribué',
  new Set(base[T.FAC].map((x) => x.fields['Numéro'])).size === base[T.FAC].length,
  base[T.FAC].map((x) => x.fields['Numéro']).join(' '));
r = await appel({ method: 'PATCH', body: { id: 'recFACTURE0000002', action: 'avoir' } });
V('une facture annulée ne donne pas d\'avoir', r.code === 409, r.corps.error);

console.log('\n⑥ Deux avoirs successifs prennent deux numéros distincts');
base[T.FAC].push(facture('recFACTURE0000004', 4, { 'Statut': 'Envoyée', "Date d'envoi": '2026-09-30' }));
base[T.FAC].push(facture('recFACTURE0000005', 5, { 'Statut': 'Envoyée', "Date d'envoi": '2026-09-30' }));
const r1 = await avoir('recFACTURE0000004');
const r2 = await avoir('recFACTURE0000005');
V('numéros différents', r1.corps.numero !== r2.corps.numero, `${r1.corps.numero} ≠ ${r2.corps.numero}`);
V('aucune référence en double',
  new Set(base[T.FAC].map(referenceFacture)).size === base[T.FAC].length,
  base[T.FAC].map(referenceFacture).join(' '));

// ═══ 7 — Avoir sur une facture au détail d'ANCIEN format ═══
// Le piège : ré-encoder une ligne sans date produisait une colonne vide, la
// relecture décalait tout d'un cran, et le client recevait un avoir dont les
// lignes ne sommaient pas à son propre total.
console.log('\n⑦ Avoir sur une facture au format hérité (5 colonnes)');
reinit();
base[T.FAC].push(facture('recFACTURE0000009', 30, {
  'Statut': 'Envoyée', "Date d'envoi": '2026-09-30', 'Total HT': 517.5,
  'Détail des prestations': 'Femme de chambre | 12 interventions | 23 h | 22.5 €/h | 517.5 €',
}));
r = await avoir('recFACTURE0000009');
V('avoir émis', r.code === 200, r.corps.error || r.corps.numero);
const ancien = fac(r.corps.numero);
const lignesAvoir = decoderDetail(ancien.fields['Détail des prestations']);
const sommeAvoir = lignesAvoir.reduce((s2, l) => s2 + l.montant, 0);
V('les lignes somment au total de l\'avoir',
  Math.abs(sommeAvoir - ancien.fields['Total HT']) < 0.01,
  `lignes ${sommeAvoir} € vs total ${ancien.fields['Total HT']} €`);
V('la description n\'est pas perdue', lignesAvoir[0].prestation === 'Femme de chambre', lignesAvoir[0].prestation);

console.log('\n⑦bis Même contrôle sur une facture au format enrichi');
base[T.FAC].push(facture('recFACTURE0000010', 31, {
  'Statut': 'Envoyée', "Date d'envoi": '2026-09-30', 'Total HT': 258.75,
}));
const avantLignes = decoderDetail(fac('F26-031').fields['Détail des prestations']);
r = await avoir('recFACTURE0000010');
const enrichi = fac(r.corps.numero);
const l2 = decoderDetail(enrichi.fields['Détail des prestations']);
V('les lignes somment au total de l\'avoir',
  Math.abs(l2.reduce((s2, l) => s2 + l.montant, 0) - enrichi.fields['Total HT']) < 0.01,
  `lignes ${l2.reduce((s2, l) => s2 + l.montant, 0)} € vs total ${enrichi.fields['Total HT']} €`);
V('chaque ligne est l\'exacte opposée de l\'originale',
  l2.every((l, i) => Math.abs(l.montant + avantLignes[i].montant) < 0.01));
V('la date survit à l\'aller-retour', l2[0].date === '2026-09-16', String(l2[0].date));

// ═══ 8 — Airtable numérote la ligne (« Numéro » en numéro automatique) ═══
console.log('\n⑧ Quand Airtable attribue lui-même le numéro de ligne');
reinit();
let ligne = 40;
const fetchNormal = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const rep = await fetchNormal(url, options);
  if ((options.method || 'GET') === 'POST') {
    const rec = await rep.json();
    ligne += 1;
    rec.fields['Numéro'] = ligne;          // ce que renvoie un champ autoNumber
    return { ok: true, status: 200, json: async () => rec };
  }
  return rep;
};
base[T.FAC].push(facture('recFACTURE0000020', 20, { 'Statut': 'Envoyée', "Date d'envoi": '2026-09-30' }));
r = await avoir('recFACTURE0000020');
V('référence bâtie sur le numéro de ligne', r.corps.numero === 'A26-041', r.corps.numero);
V('le code n\'a PAS écrit le numéro lui-même',
  base[T.FAC].at(-1).fields['Numéro'] === 41, JSON.stringify(base[T.FAC].at(-1).fields['Numéro']));
globalThis.fetch = fetchNormal;

console.log(ko ? `\n${ko} vérification(s) en échec.` : '\nToutes les vérifications passent.');
process.exit(ko ? 1 : 0);
