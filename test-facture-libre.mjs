process.env.AIRTABLE_TOKEN='faux';
const T={SAL:'tbl12XOxlZk1xFy5W',HOT:'tbltHWrjqtIT8wn3I',PRE:'tbl63cY9itn3Lk1Ar',PTG:'tbl1srurt2A2Ges03',FAC:'tblqw9ieeljA8iPb7',REL:'tblaxyhAkr7BFBYcC',CON:'tblE5utP1UAfBTqx4'};
let base,seq;
function reinit(){seq=0;base={[T.SAL]:[],[T.PTG]:[],[T.REL]:[],[T.FAC]:[],[T.CON]:[],
 [T.PRE]:[{id:'recPRESTATION0001',fields:{'Type de prestation':'Femme de chambre'}}],
 [T.HOT]:[{id:'recCLIENT00000001',fields:{Nom:'PFA','Type de client':'Cabinet','Délai de paiement (jours)':45}},
          {id:'recCLIENTSANSNOM1',fields:{'Code client':'CL099'}}]};}
globalThis.fetch=async(url,o={})=>{const u=new URL(url);const[,,,t,rid]=u.pathname.split('/');const m=o.method||'GET';const c=o.body?JSON.parse(o.body):null;const ok=d=>({ok:true,status:200,json:async()=>d});
 if(m==='POST'){seq+=1;const r={id:`recNEW${String(seq).padStart(11,'0')}`,fields:c.fields};base[t].push(r);return ok(r);}
 if(m==='PATCH'){const r=base[t].find(x=>x.id===rid);r.fields={...r.fields,...c.fields};return ok(r);}
 if(rid)return ok(base[t].find(x=>x.id===rid)||null);
 let rs=base[t]||[];const f=u.searchParams.get('filterByFormula')||'';const g=f.match(/RECORD_ID\(\) = '([^']+)'/);if(g)rs=rs.filter(x=>x.id===g[1]);return ok({records:rs});};
const{default:h}=await import('./api/_lib/admin/factures.js');
const{referenceFacture,decoderDetail}=await import('./api/_lib/admin/factures.js');
const res=()=>{const r={code:200,corps:null};r.setHeader=()=>{};r.status=c=>{r.code=c;return r;};r.json=d=>{r.corps=d;return r;};r.send=d=>{r.corps=d;return r;};return r;};
const post=async b=>{const r=res();await h({method:'POST',headers:{},query:{},body:b},r);return r;};
let ko=0;const V=(t,c,d='')=>{if(!c)ko+=1;console.log(`  ${c?'✅':'❌'} ${t}${d?`  → ${d}`:''}`);};
const L=[{prestation:'Remise en état après travaux',montant:1250}];

reinit();
console.log('\n① Facture libre');
let r=await post({type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:L});
V('créée',r.code===200,r.corps.error||r.corps.numero);
let f=base[T.FAC].at(-1);
V('référence facture',/^F26-\d{3}$/.test(r.corps.numero),r.corps.numero);
V('statut Brouillon',f.fields['Statut']==='Brouillon');
V('total positif',f.fields['Total HT']===1250,`${f.fields['Total HT']} €`);
V('mois facturé renseigné',f.fields['Mois facturé']==='2026-09-01',f.fields['Mois facturé']);
V('échéance = émission + 45 j du client',f.fields["Date d'échéance"]==='2026-11-14',f.fields["Date d'échéance"]);
V('la ligne ne porte PAS de date',decoderDetail(f.fields['Détail des prestations'])[0].date===null);
V('la description est le seul titre de la prestation',
  decoderDetail(f.fields['Détail des prestations'])[0].prestation==='Remise en état après travaux');

console.log('\n② Avoir libre');
r=await post({type:'avoir',client:'recCLIENT00000001',mois:'2026-09',lignes:L});
f=base[T.FAC].at(-1);
V('référence avoir',/^A26-\d{3}$/.test(r.corps.numero),r.corps.numero);
V('statut Avoir',f.fields['Statut']==='Avoir');
V('montant porté en négatif',f.fields['Total HT']===-1250,`${f.fields['Total HT']} €`);
V('ligne en négatif',decoderDetail(f.fields['Détail des prestations'])[0].montant===-1250);
V('aucune échéance',!f.fields["Date d'échéance"]);

console.log('\n③ Quantité × prix unitaire');
r=await post({type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:[{prestation:'Renfort',heures:12,tarif:28,montant:336}]});
const l3=decoderDetail(base[T.FAC].at(-1).fields['Détail des prestations'])[0];
V('quantité et prix conservés',l3.heures===12&&l3.tarif===28,`${l3.heures} × ${l3.tarif}`);

console.log('\n④ Plusieurs lignes');
r=await post({type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:[
 {prestation:'Nettoyage',montant:400},{prestation:'Déplacement',montant:80}]});
V('total additionné',base[T.FAC].at(-1).fields['Total HT']===480,`${base[T.FAC].at(-1).fields['Total HT']} €`);

console.log('\n⑤ Ce que le serveur refuse');
const nb=base[T.FAC].length;
for(const[titre,corps,motif]of[
 ['type inconnu',{type:'devis',client:'recCLIENT00000001',mois:'2026-09',lignes:L},/Type/],
 ['client absent',{type:'facture',client:'recABSENT00000001',mois:'2026-09',lignes:L},/introuvable/],
 ['client sans nom',{type:'facture',client:'recCLIENTSANSNOM1',mois:'2026-09',lignes:L},/nom/],
 ['mois manquant',{type:'facture',client:'recCLIENT00000001',lignes:L},/Mois/],
 ['aucune ligne',{type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:[]},/ligne/],
 ['ligne sans libellé',{type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:[{montant:10}]},/[Dd]escription/],
 ['montant nul',{type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:[{prestation:'X',montant:0}]},/montant/],
 ['montant négatif',{type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:[{prestation:'X',montant:-5}]},/montant/],
]){const x=await post(corps);V(`${titre} refusé`,x.code===400&&motif.test(x.corps.error||''),`${x.code} — ${x.corps.error||''}`);}
V('aucune pièce créée par les refus',base[T.FAC].length===nb,`${base[T.FAC].length} vs ${nb}`);

console.log('\n⑥ La pièce apparaît bien au cockpit');
reinit();
await post({type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:L});
const g=res();await h({method:'GET',headers:{},query:{periode:'mois',mois:'2026-09'}},g);
V('visible dans la liste',g.corps.lignes.some(x=>x.hotel==='PFA'&&x.totalHT===1250));
V('comptée dans le total facturé',g.corps.totalFacture.ht===1250,`${g.corps.totalFacture.ht} €`);
// ═══ 7 — Le rang s'inscrit en TEXTE, et son refus n'emporte pas la création ═══
console.log('\n⑦ Inscription du rang');
reinit();
r=await post({type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:L});
V('rang écrit en texte, pas en nombre',typeof base[T.FAC].at(-1).fields['Numéro']==='string',
  JSON.stringify(base[T.FAC].at(-1).fields['Numéro']));

console.log('\n⑦bis Champ « Numéro » en lecture seule (numéro automatique)');
reinit();
const brut=globalThis.fetch;
globalThis.fetch=async(url,o={})=>{
  if((o.method||'GET')==='PATCH'&&JSON.parse(o.body||'{}').fields?.['Numéro']!==undefined){
    return {ok:false,status:422,json:async()=>({error:{message:'Field "Numéro" cannot accept the provided value'}})};
  }
  return brut(url,o);
};
r=await post({type:'facture',client:'recCLIENT00000001',mois:'2026-09',lignes:L});
V('la pièce est créée malgré le refus',r.code===200,r.corps.error||r.corps.numero);
V('une référence est tout de même rendue',/^F26-\d{3}$/.test(r.corps.numero||''),r.corps.numero);
globalThis.fetch=brut;
console.log(ko?`\n${ko} en échec.`:'\nToutes les vérifications passent.');
process.exit(ko?1:0);
