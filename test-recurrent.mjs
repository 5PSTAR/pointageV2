// Mode récurrent : le contrat fournit la ligne, la périodicité décide du mois.
// Règle cardinale : un client au forfait ne disparaît JAMAIS du cockpit.
process.env.AIRTABLE_TOKEN = 'faux';

const T = { SAL: 'tbl12XOxlZk1xFy5W', HOT: 'tbltHWrjqtIT8wn3I', PRE: 'tbl63cY9itn3Lk1Ar', PTG: 'tbl1srurt2A2Ges03', FAC: 'tblqw9ieeljA8iPb7', REL: 'tblaxyhAkr7BFBYcC', CON: 'tblE5utP1UAfBTqx4' };
let base, seq;

const contrat = (id, champs) => ({ id, fields: {
  'Libellé': 'Contrat de nettoyage', 'Client': ['recCLIENTPFA00001'], 'Montant HT': 540,
  'Fréquence': 'Mensuelle', 'Actif': true, 'Date de début': '2026-09-01', ...champs } });

function reinit(contrats = [contrat('recCONTRAT0000001', {})]) {
  seq = 0;
  base = {
    [T.SAL]: [], [T.PTG]: [], [T.REL]: [], [T.FAC]: [],
    [T.PRE]: [{ id: 'recPRESTATION0001', fields: { 'Type de prestation': 'Femme de chambre', 'Tarif 3 étoiles': 22.5 } }],
    [T.HOT]: [
      { id: 'recCLIENTPFA00001', fields: { Nom: 'PFA', 'Type de client': 'Cabinet', 'Mode de facturation': 'Récurrent', Adresse: '58 avenue de la Grande Armée', Ville: 'Paris', 'Code postal': '75008' } },
      { id: 'recHOTELHORAIRE01', fields: { Nom: 'Hôtel Arc Elysées', 'Mode de facturation': 'Pointage horaire', 'Catégorie': '3 étoiles' } },
    ],
    [T.CON]: contrats,
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
  const f = u.searchParams.get('filterByFormula') || '';
  let rs = base[table] || [];
  const parId = f.match(/RECORD_ID\(\) = '([^']+)'/);
  if (parId) rs = rs.filter((r) => r.id === parId[1]);
  return ok({ records: rs });
};

const { default: handler } = await import('./api/_lib/admin/factures.js');
const res = () => { const r = { code: 200, corps: null }; r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; }; r.json = (d) => { r.corps = d; return r; }; r.send = (d) => { r.corps = d; return r; }; return r; };
const appel = async (req) => { const r = res(); await handler({ headers: {}, query: {}, ...req }, r); return r; };
const lire = (mois) => appel({ method: 'GET', query: { periode: 'mois', mois } });
const pfa = (corps) => (corps.lignes || []).find((l) => l.hotel === 'PFA');

let ko = 0;
let x;
const V = (t, c, d = '') => { if (!c) ko += 1; console.log(`  ${c ? '✅' : '❌'} ${t}${d ? `  → ${d}` : ''}`); };

// ═══ 1 — Le contrat réel de PFA ═══
reinit();
console.log('\n① Contrat mensuel de 540 € à partir de septembre 2026');
let r = await lire('2026-09');
let l = pfa(r.corps);
V('PFA apparaît au cockpit', Boolean(l), l ? `${l.totalHT} €` : 'absent');
V('montant du contrat', l.totalHT === 540, `${l.totalHT} €`);
V('aucun blocage', !l.bloquant, l.bloquant || '—');
V('origine récurrente', l.origine === 'Récurrent', l.origine);
V('une ligne, datée de la fin du mois', l.lignes.length === 1 && l.lignes[0].date === '2026-09-30', JSON.stringify(l.lignes[0]));
V('ni heures ni tarif sur la ligne', l.lignes[0].heures === null && l.lignes[0].tarif === null);
V('le mois suivant aussi', (await lire('2026-10')).corps.lignes.some((x) => x.hotel === 'PFA' && x.totalHT === 540));
V('avant le début du contrat, rien', !pfa((await lire('2026-08')).corps));

console.log('\n② Génération');
r = await appel({ method: 'POST', body: { mois: '2026-09' } });
V('facture créée', (r.corps.creees || []).some((c) => c.hotel === 'PFA'), JSON.stringify(r.corps.creees));
const fac = base[T.FAC].at(-1);
V('le contrat est tracé sur la facture', fac.fields['Contrat récurrent']?.[0] === 'recCONTRAT0000001');
V('détail encodé sans « null h »', /\| — \| — \| 540 €/.test(fac.fields['Détail des prestations']), fac.fields['Détail des prestations']);
V('pas de régénération au second clic', ((await appel({ method: 'POST', body: { mois: '2026-09' } })).corps.creees || []).length === 0);

// ═══ 3 — Durée indéterminée ═══
console.log('\n③ Contrat à durée indéterminée (pas de date de fin)');
reinit([contrat('recCONTRAT0000001', { 'Date de fin': undefined })]);
V('facturé en septembre 2026', pfa((await lire('2026-09')).corps)?.totalHT === 540);
V('facturé cinq ans plus tard', pfa((await lire('2031-09')).corps)?.totalHT === 540);
console.log('\n③bis Contrat à durée déterminée, après son terme');
reinit([contrat('recCONTRAT0000001', { 'Date de fin': '2026-10-31' })]);
V('facturé en octobre 2026', pfa((await lire('2026-10')).corps)?.totalHT === 540);
l = pfa((await lire('2026-11')).corps);
V('en novembre : visible mais bloqué', Boolean(l) && !!l.bloquant, l ? l.bloquant : 'ABSENT — le client a disparu');

// ═══ 4 — Périodicité ═══
console.log('\n④ Contrat annuel démarré en septembre');
reinit([contrat('recCONTRAT0000001', { 'Fréquence': 'Annuelle', 'Montant HT': 6480 })]);
V('facturé en septembre 2026', pfa((await lire('2026-09')).corps)?.totalHT === 6480);
V('pas en octobre', !pfa((await lire('2026-10')).corps));
V('pas en août 2027', !pfa((await lire('2027-08')).corps));
V('de nouveau en septembre 2027', pfa((await lire('2027-09')).corps)?.totalHT === 6480);
console.log('\n④bis Contrat trimestriel démarré en septembre');
reinit([contrat('recCONTRAT0000001', { 'Fréquence': 'Trimestrielle', 'Montant HT': 1620 })]);
for (const [m, attendu] of [['2026-09', true], ['2026-10', false], ['2026-11', false], ['2026-12', true], ['2027-03', true]]) {
  V(`${m} ${attendu ? 'facturé' : 'non facturé'}`, Boolean(pfa((await lire(m)).corps)) === attendu);
}

// ═══ 5 — Les données douteuses bloquent, elles ne facturent pas ═══
console.log('\n⑤ Données incomplètes : visible et bloqué, jamais émis par défaut');
for (const [titre, champs, motif] of [
  ['fréquence vide', { 'Fréquence': undefined }, /fréquence non renseignée/],
  ['fréquence inconnue', { 'Fréquence': 'Bimestrielle' }, /inconnue/],
  ['sans montant', { 'Montant HT': undefined }, /montant/],
  ['sans date de début', { 'Date de début': undefined }, /date de début/],
  ['sans libellé', { 'Libellé': undefined }, /libellé/],
  ['contrat inactif', { 'Actif': false }, /aucun contrat actif sur ce mois/],
]) {
  reinit([contrat('recCONTRAT0000001', champs)]);
  const x = pfa((await lire('2026-09')).corps);
  V(`${titre} : le client reste visible`, Boolean(x), x ? `bloqué : ${x.bloquant}` : 'ABSENT');
  V(`${titre} : motif explicite`, x && motif.test(x.bloquant || ''), x?.bloquant || '');
  const g = await appel({ method: 'POST', body: { mois: '2026-09' } });
  V(`${titre} : rien n'est émis`, (g.corps.creees || []).length === 0 && (g.corps.ignorees || []).some((i) => i.hotel === 'PFA'), JSON.stringify(g.corps.ignorees));
}
console.log('\n⑤ter Case « Actif » DÉCOCHÉE — Airtable omet le champ, il n\'est pas « false »');
reinit([contrat('recCONTRAT0000001', { 'Actif': undefined })]);
x = pfa((await lire('2026-09')).corps);
V('le contrat décoché n\'est PAS facturé', Boolean(x) && !!x.bloquant, x ? x.bloquant : 'ABSENT');
V('rien n\'est émis', ((await appel({ method: 'POST', body: { mois: '2026-09' } })).corps.creees || []).length === 0);

console.log('\n⑤bis Client au forfait sans aucun contrat');
reinit([]);
x = pfa((await lire('2026-09')).corps);
V('visible au cockpit', Boolean(x), x ? x.bloquant : 'ABSENT — un mois de CA évaporé');
V('motif lisible', /aucun contrat/.test(x?.bloquant || ''), x?.bloquant);

// ═══ 6 — Les vues année et tout ne tombent plus ═══
console.log('\n⑥ Vues « année » et « tout l’historique »');
reinit();
r = await appel({ method: 'GET', query: { periode: 'annee', annee: '2026' } });
V('vue année : réponse 200', r.code === 200, r.corps?.error || `${r.corps.lignes.length} ligne(s)`);
V('un mois par échéance passée', r.corps.lignes.filter((y) => y.hotel === 'PFA').length >= 1, `${r.corps.lignes.filter((y) => y.hotel === 'PFA').length} mois`);
r = await appel({ method: 'GET', query: { periode: 'tout' } });
V('vue tout : réponse 200', r.code === 200, r.corps?.error || `${r.corps.lignes.length} ligne(s)`);

// ═══ 7 — Les heures d'un client au forfait ne sont pas refacturées ═══
console.log('\n⑦ Heures pointées chez un client au forfait');
reinit();
base[T.PTG].push({ id: 'recPOINTAGE000001', fields: { 'Pointage ID': 90, 'Salarié': [], 'Hôtel': ['recCLIENTPFA00001'],
  'Prestations': ['recPRESTATION0001'], Date: '2026-09-15', "Heure d'arrivée": '2026-09-15T06:00:00.000Z',
  'Heure de départ': '2026-09-15T11:00:00.000Z', Statut: 'Terminée' } });
r = await lire('2026-09');
V('le forfait reste à 540 €, pas 540 + les heures', pfa(r.corps).totalHT === 540, `${pfa(r.corps).totalHT} €`);
V('les heures sont signalées, pas perdues', (r.corps.aRegulariser || []).some((p) => /forfait/.test(p.raison)), JSON.stringify(r.corps.aRegulariser?.[0]?.raison));

// ═══ 8 — Un mode inconnu ne coupe pas la facturation ═══
console.log('\n⑧ Mode de facturation mal orthographié');
reinit();
base[T.HOT][1].fields['Mode de facturation'] = 'horaire';   // valeur inattendue
base[T.PTG].push({ id: 'recPOINTAGE000002', fields: { 'Pointage ID': 91, 'Salarié': [], 'Hôtel': ['recHOTELHORAIRE01'],
  'Prestations': ['recPRESTATION0001'], Date: '2026-09-15', "Heure d'arrivée": '2026-09-15T06:00:00.000Z',
  'Heure de départ': '2026-09-15T11:00:00.000Z', Statut: 'Terminée' } });
r = await lire('2026-09');
V('l’hôtel reste facturé à l’heure', r.corps.lignes.some((y) => y.hotel === 'Hôtel Arc Elysées' && y.totalHT > 0),
  JSON.stringify(r.corps.lignes.filter((y) => y.hotel === 'Hôtel Arc Elysées').map((y) => y.totalHT)));

console.log(ko ? `\n${ko} vérification(s) en échec.` : '\nToutes les vérifications passent.');
process.exit(ko ? 1 : 0);
