// Pause déduite : règle portée par le client, comptée par journée et par
// salariée, au-delà d'une présence minimale. Elle se retranche de ce que le
// client paie ET de ce que la salariée touche.
const { appliquerPause, lignesParJour, PRESENCE_MIN_POUR_PAUSE_H } =
  await import('/Users/lauraballo/pointageV2/api/_lib/admin/factures.js');

let ko = 0;
const V = (t, c, d = '') => { if (!c) ko += 1; console.log(`  ${c ? '✅' : '❌'} ${t}${d ? `  → ${d}` : ''}`); };
const p = (id, salarieId, date, duree, prestation = 'Femme de chambre') =>
  ({ id, salarieId, date, duree, prestation, tarifFacturation: 20, numero: id });
const durees = (ps) => ps.map((x) => x.duree).join(' + ');

console.log(`\n  Seuil de présence : ${PRESENCE_MIN_POUR_PAUSE_H} h · pause portée par la plus longue vacation\n`);

console.log('① En deçà du seuil, rien n\'est déduit');
V('5 h restent 5 h', appliquerPause([p('a', 's1', '2026-09-01', 5)], 30)[0].duree === 5);
V('7,99 h restent 7,99 h', appliquerPause([p('a', 's1', '2026-09-01', 7.99)], 30)[0].duree === 7.99);

console.log('\n② Au seuil, une déduction');
let r = appliquerPause([p('a', 's1', '2026-09-01', 8)], 30);
V('8 h deviennent 7,5 h', r[0].duree === 7.5, `${r[0].duree} h`);
V('la durée brute reste consultable', r[0].dureeBrute === 8);
V('la pause est tracée sur le pointage', r[0].pauseMinutes === 30);

console.log('\n③ Deux vacations le même jour : la pause ne se prend qu\'une fois');
r = appliquerPause([p('a', 's1', '2026-09-01', 5), p('b', 's1', '2026-09-01', 4)], 30);
V('9 h au total deviennent 8,5 h', r.reduce((s, x) => s + x.duree, 0) === 8.5, durees(r));
V('la plus longue vacation porte la pause',
  r.find((x) => x.id === 'a').duree === 4.5 && r.find((x) => x.id === 'b').duree === 4, durees(r));

console.log('\n④ Deux salariées le même jour : chacune la sienne');
r = appliquerPause([p('a', 's1', '2026-09-01', 8), p('b', 's2', '2026-09-01', 8)], 30);
V('deux déductions distinctes', r.every((x) => x.duree === 7.5), durees(r));

console.log('\n⑤ Deux journées : une pause par journée');
r = appliquerPause([p('a', 's1', '2026-09-01', 8), p('b', 's1', '2026-09-02', 8)], 30);
V('7,5 h chaque jour', r.every((x) => x.duree === 7.5), durees(r));

console.log('\n⑥ Client sans pause : rien ne bouge');
V('valeur 0', appliquerPause([p('a', 's1', '2026-09-01', 9)], 0)[0].duree === 9);
V('champ vide', appliquerPause([p('a', 's1', '2026-09-01', 9)], null)[0].duree === 9);
V('aucune trace parasite', appliquerPause([p('a', 's1', '2026-09-01', 9)], 0)[0].pauseMinutes === undefined);

console.log('\n⑦ La pause vaut pour toutes les prestations, pas seulement le ménage');
V('Gouvernante aussi', appliquerPause([p('a', 's1', '2026-09-01', 9, 'Gouvernante')], 30)[0].duree === 8.5);
V('Petits déjeuners aussi', appliquerPause([p('a', 's1', '2026-09-01', 9, 'Petits déjeuners')], 30)[0].duree === 8.5);

console.log('\n⑧ La durée de pause suit le client');
V('45 min donnent 7,25 h', appliquerPause([p('a', 's1', '2026-09-01', 8)], 45)[0].duree === 7.25);
V('20 min donnent 7,67 h', appliquerPause([p('a', 's1', '2026-09-01', 8)], 20)[0].duree === 7.67);

console.log('\n⑨ Les pointages d\'origine ne sont jamais modifiés');
const source = [p('a', 's1', '2026-09-01', 8)];
appliquerPause(source, 30);
V('la source garde 8 h — c\'est elle qui paie la salariée', source[0].duree === 8);

console.log('\n⑩ La ligne de facture reporte le net et la pause');
let l = lignesParJour(appliquerPause([p('a', 's1', '2026-09-01', 5), p('b', 's2', '2026-09-01', 4)], 30));
V('deux salariées sous le seuil : 9 h facturées', l[0].heures === 9, `${l[0].heures} h`);
V('aucune pause sur la ligne', l[0].pauseMinutes === 0);
l = lignesParJour(appliquerPause([p('a', 's1', '2026-09-01', 8), p('b', 's2', '2026-09-01', 8)], 30));
V('deux salariées à 8 h : 15 h facturées', l[0].heures === 15, `${l[0].heures} h`);
V('60 min de pause reportés sur la ligne', l[0].pauseMinutes === 60);
V('montant calculé sur le net', l[0].montant === 300, `${l[0].montant} €`);


// ═══ Côté paie : la salariée n'est pas payée sur la pause non plus ═══
// La pause appartient au client : elle ne se déduit que des journées passées
// chez un client qui la demande, et seulement si le seuil y est atteint.
process.env.AIRTABLE_TOKEN = 'faux';
const T = { SAL:'tbl12XOxlZk1xFy5W', HOT:'tbltHWrjqtIT8wn3I', PRE:'tbl63cY9itn3Lk1Ar', PTG:'tbl1srurt2A2Ges03' };
const base = {
  [T.SAL]: [{ id:'recSALARIEE000001', fields:{ Nom:'Claudine', 'Taux Horaire':12 } }],
  [T.HOT]: [
    { id:'recAVECPAUSE00001', fields:{ Nom:'Hôtel le lavoisier', 'Pause déduite (minutes)':30, 'Catégorie':'3 étoiles' } },
    { id:'recSANSPAUSE00001', fields:{ Nom:'Hôtel Arc Elysées', 'Pause déduite (minutes)':0, 'Catégorie':'4 étoiles' } },
  ],
  [T.PRE]: [{ id:'recPRESTATION0001', fields:{ 'Type de prestation':'Femme de chambre', 'Tarif 3 étoiles':22.5 } }],
  [T.PTG]: [],
};
const pt = (id, hotel, date, h) => ({ id, fields: {
  'Pointage ID': id.slice(-2), 'Salarié':['recSALARIEE000001'], 'Hôtel':[hotel], 'Prestations':['recPRESTATION0001'],
  Date: date, "Heure d'arrivée": `${date}T06:00:00.000Z`, 'Heure de départ': `${date}T${String(6+h).padStart(2,'0')}:00:00.000Z`,
  Statut:'Terminée' } });

globalThis.fetch = async (url) => {
  const [, , , table] = new URL(url).pathname.split('/');
  return { ok: true, status: 200, json: async () => ({ records: base[table] }) };
};
const { default: budget } = await import('/Users/lauraballo/pointageV2/api/_lib/admin/budget.js');
const paie = async (mois) => {
  const r = { code: 200, corps: null, setHeader() {}, status(c) { this.code = c; return this; },
    json(d) { this.corps = d; return this; }, send(d) { this.corps = d; return this; } };
  await budget({ method: 'GET', query: { mois }, headers: {} }, r);
  return r;
};
let q;

console.log('\n⑪ Journée de 9 h dans un hôtel AVEC pause');
base[T.PTG] = [pt('recPOINTAGE000001','recAVECPAUSE00001','2026-09-01',9)];
q = await paie('2026-09');
V('payée 8,5 h', q.corps.lignes[0].heures === 8.5, `${q.corps.lignes[0].heures} h`);
V('coût 102 €', q.corps.lignes[0].cout === 102, `${q.corps.lignes[0].cout} €`);

console.log('\n⑫ La même journée dans un hôtel SANS pause');
base[T.PTG] = [pt('recPOINTAGE000002','recSANSPAUSE00001','2026-09-01',9)];
q = await paie('2026-09');
V('payée 9 h', q.corps.lignes[0].heures === 9, `${q.corps.lignes[0].heures} h`);

console.log('\n⑬ 5 h avec pause + 4 h sans pause le même jour');
base[T.PTG] = [pt('recPOINTAGE000003','recAVECPAUSE00001','2026-09-01',5), pt('recPOINTAGE000004','recSANSPAUSE00001','2026-09-01',4)];
q = await paie('2026-09');
V('9 h payées : aucun hôtel n\'atteint 8 h', q.corps.lignes[0].heures === 9, `${q.corps.lignes[0].heures} h`);

console.log('\n⑭ Deux vacations le même jour dans l\'hôtel avec pause');
base[T.PTG] = [pt('recPOINTAGE000005','recAVECPAUSE00001','2026-09-01',5), pt('recPOINTAGE000006','recAVECPAUSE00001','2026-09-01',4)];
q = await paie('2026-09');
V('9 h → 8,5 h, une seule pause', q.corps.lignes[0].heures === 8.5, `${q.corps.lignes[0].heures} h`);

console.log('\n⑮ Sous le seuil');
base[T.PTG] = [pt('recPOINTAGE000007','recAVECPAUSE00001','2026-09-01',6)];
q = await paie('2026-09');
V('6 h payées 6 h', q.corps.lignes[0].heures === 6, `${q.corps.lignes[0].heures} h`);

console.log(ko ? `\n${ko} vérification(s) en échec.` : '\nToutes les vérifications passent.');
process.exit(ko ? 1 : 0);
