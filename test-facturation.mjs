// Reproduit la base de Laura : un hôtel sans nom, portant un pointage terminé.
process.env.AIRTABLE_TOKEN = 'faux';
const T = { SAL:'tbl12XOxlZk1xFy5W', HOT:'tbltHWrjqtIT8wn3I', PRE:'tbl63cY9itn3Lk1Ar', PTG:'tbl1srurt2A2Ges03', FAC:'tblqw9ieeljA8iPb7', REL:'tblaxyhAkr7BFBYcC' };
let base;

function reinit() {
  base = {
    [T.SAL]: [{ id:'recSALARIEE000001', fields:{ Nom:'Ako', 'Taux Horaire':12 } }],
    [T.HOT]: [
      { id:'recHOTEL000000001', fields:{ Nom:'Hôtel Arc de Triomphe', 'Catégorie':'4 étoiles', Adresse:'1 av.', Ville:'Paris' } },
      // La fiche CL019 : elle existe, mais son nom est vide.
      { id:'recHOTELSANSNOM01', fields:{ 'Code client':'CL019' } },
    ],
    [T.PRE]: [{ id:'recPRESTATION0001', fields:{ 'Type de prestation':'Équipier', 'Tarif 4 étoiles':25.5 } }],
    [T.PTG]: [
      { id:'recPOINTAGE000032', fields:{ 'Pointage ID':32, 'Salarié':['recSALARIEE000001'], 'Hôtel':['recHOTEL000000001'], 'Prestations':['recPRESTATION0001'],
        Date:'2026-09-12', "Heure d'arrivée":'2026-09-12T06:00:00.000Z', 'Heure de départ':'2026-09-12T11:00:00.000Z', Statut:'Terminée' } },
      // n°31 : rattaché à la fiche sans nom
      { id:'recPOINTAGE000031', fields:{ 'Pointage ID':31, 'Salarié':['recSALARIEE000001'], 'Hôtel':['recHOTELSANSNOM01'], 'Prestations':['recPRESTATION0001'],
        Date:'2026-09-12', "Heure d'arrivée":'2026-09-12T07:00:00.000Z', 'Heure de départ':'2026-09-12T10:00:00.000Z', Statut:'Terminée' } },
      // n°33 : aucun hôtel du tout
      { id:'recPOINTAGE000033', fields:{ 'Pointage ID':33, 'Salarié':['recSALARIEE000001'], 'Prestations':['recPRESTATION0001'],
        Date:'2026-09-14', "Heure d'arrivée":'2026-09-14T07:00:00.000Z', 'Heure de départ':'2026-09-14T12:00:00.000Z', Statut:'Terminée' } },
    ],
    [T.FAC]: [], [T.REL]: [],
  };
}

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const [, , , table, recId] = u.pathname.split('/');
  const m = options.method || 'GET';
  const corps = options.body ? JSON.parse(options.body) : null;
  const ok = (d) => ({ ok:true, status:200, json: async () => d });
  if (m === 'POST') { const r = { id:`recNEW${String(base[table].length).padStart(11,'0')}`, fields:corps.fields }; base[table].push(r); return ok(r); }
  if (m === 'PATCH') { const r = base[table].find((x) => x.id === recId); r.fields = { ...r.fields, ...corps.fields }; return ok(r); }
  if (recId) return ok(base[table].find((x) => x.id === recId) || null);
  return ok({ records: base[table] });
};

const { default: factures } = await import('./api/_lib/admin/factures.js');
const { default: pointages } = await import('./api/_lib/admin/pointages.js');

const res = () => { const r = { code:200, corps:null }; r.setHeader=()=>{}; r.status=(c)=>{r.code=c;return r;}; r.json=(d)=>{r.corps=d;return r;}; r.send=(d)=>{r.corps=d;return r;}; return r; };
const appel = async (h, req) => { const r = res(); await h({ headers:{}, query:{}, ...req }, r); return r; };

let ko = 0;
const V = (t, c, d='') => { if (!c) ko += 1; console.log(`  ${c?'✅':'❌'} ${t}${d?`  → ${d}`:''}`); };

reinit();
console.log('\n① L\'onglet facturation ne plante plus');
let r = await appel(factures, { method:'GET', query:{ periode:'mois', mois:'2026-09' } });
V('réponse 200', r.code === 200, r.corps?.error || 'ok');
V('la facturation se fait quand même', r.corps?.lignes?.length === 1, `${r.corps?.lignes?.length} ligne(s)`);
V('elle ne retient que le pointage valide', r.corps?.lignes?.[0]?.totalHT === 127.5, `${r.corps?.lignes?.[0]?.totalHT} € HT`);

console.log('\n② Les pointages écartés sont signalés, pas perdus');
const ar = r.corps?.aRegulariser || [];
V('2 pointages à régulariser', ar.length === 2, ar.map((x) => `n°${x.numero}`).join(' '));
for (const p of ar) console.log(`       n°${p.numero} · ${p.date} · ${p.salarie} · ${p.duree} h — ${p.raison}`);
V('la fiche sans nom est nommée comme telle', ar.some((x) => x.raison === 'fiche hôtel sans nom'));
V('le pointage sans hôtel aussi', ar.some((x) => x.raison === 'aucun hôtel rattaché'));

console.log('\n③ Les autres périodes tiennent aussi');
for (const q of [{ periode:'annee', annee:'2026' }, { periode:'tout' }]) {
  r = await appel(factures, { method:'GET', query:q });
  V(`période « ${q.periode} »`, r.code === 200, r.corps?.error || `${r.corps?.lignes?.length} ligne(s)`);
}

console.log('\n④ La génération de factures ne plante pas non plus');
r = await appel(factures, { method:'POST', body:{ mois:'2026-09' } });
V('réponse 200', r.code === 200, r.corps?.error || JSON.stringify(r.corps?.creees || r.corps).slice(0, 90));
const creee = base[T.FAC].at(-1);
V('la facture porte le lien vers son client', creee?.fields?.Client?.[0] === 'recHOTEL000000001', JSON.stringify(creee?.fields?.Client));
V('aucun champ « Hôtel » écrit sur la facture', !('Hôtel' in (creee?.fields || {})));

console.log('\n④bis Une facture déjà émise n\'est pas régénérée');
r = await appel(factures, { method:'POST', body:{ mois:'2026-09' } });
V('rien de créé la seconde fois', (r.corps?.creees || []).length === 0, JSON.stringify(r.corps));
r = await appel(factures, { method:'GET', query:{ periode:'mois', mois:'2026-09' } });
const emise = r.corps.lignes.find((l) => l.id);
V('la facture émise retrouve son hôtel', emise?.hotel === 'Hôtel Arc de Triomphe', String(emise?.hotel));

console.log('\n⑤ Rattacher le pointage à un vrai hôtel');
reinit();   // on repart d'un mois non encore facturé
r = await appel(pointages, { method:'PATCH', body:{ id:'recPOINTAGE000031', hotelId:'recHOTELSANSNOM01' } });
V('la fiche sans nom est refusée', r.code === 400, r.corps?.error);
r = await appel(pointages, { method:'PATCH', body:{ id:'recPOINTAGE000031', hotelId:'recPASUNHOTEL0001' } });
V('un identifiant inconnu est refusé', r.code === 400, r.corps?.error);
r = await appel(pointages, { method:'PATCH', body:{ id:'recPOINTAGE000031', hotelId:'recHOTEL000000001' } });
V('un hôtel valide est accepté', r.code === 200, r.corps?.error || 'ok');
V('le lien est bien écrit', base[T.PTG].find((x) => x.id === 'recPOINTAGE000031').fields['Hôtel'][0] === 'recHOTEL000000001');

console.log('\n⑥ Après régularisation, le pointage entre dans la facturation');
r = await appel(factures, { method:'GET', query:{ periode:'mois', mois:'2026-09' } });
V('il ne reste qu\'un pointage à régulariser', r.corps.aRegulariser.length === 1, r.corps.aRegulariser.map((x) => `n°${x.numero}`).join(''));
V('le total inclut désormais le pointage rattaché', r.corps.lignes[0].totalHT === 204, `${r.corps.lignes[0].totalHT} € HT`);

console.log('\n⑦ Mais une facture déjà émise reste figée (comportement voulu)');
reinit();
await appel(factures, { method:'POST', body:{ mois:'2026-09' } });          // facture émise sans le n°31
await appel(pointages, { method:'PATCH', body:{ id:'recPOINTAGE000031', hotelId:'recHOTEL000000001' } });
r = await appel(factures, { method:'GET', query:{ periode:'mois', mois:'2026-09' } });
V('la facture émise ne bouge pas', r.corps.lignes[0].totalHT === 127.5, `${r.corps.lignes[0].totalHT} € HT`);
V("et le pointage rattaché après coup n'est plus signalé nulle part",
  !r.corps.aRegulariser.some((x) => x.numero === 31), 'à surveiller — voir le rapport');

console.log(ko ? `\n${ko} vérification(s) en échec.` : '\nToutes les vérifications passent.');
process.exit(ko ? 1 : 0);
