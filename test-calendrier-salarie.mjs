process.env.AIRTABLE_TOKEN='faux';
const T={SAL:'tbl12XOxlZk1xFy5W',HOT:'tbltHWrjqtIT8wn3I',PRE:'tbl63cY9itn3Lk1Ar',PTG:'tbl1srurt2A2Ges03',AFF:'tblgLAcrlUoqhZ1td'};
const base={
 [T.SAL]:[{id:'recSALARIEE000001',fields:{Nom:'Claudine',Jeton:'jeton-claudine-01','Taux Horaire':12}}],
 [T.HOT]:[
  {id:'recAVECPAUSE00001',fields:{Nom:'Hôtel le lavoisier',Adresse:'21 rue Lavoisier','Code postal':'75008',Ville:'Paris','Pause déduite (minutes)':30}},
  {id:'recSANSPAUSE00001',fields:{Nom:'Hôtel Arc Elysées',Adresse:'45 rue Washington','Code postal':'75008',Ville:'Paris','Pause déduite (minutes)':0}}],
 [T.PRE]:[{id:'recPRESTATION0001',fields:{'Type de prestation':'Femme de chambre'}}],
 [T.PTG]:[
  {id:'recPOINTAGE000001',fields:{'Pointage ID':1,'Salarié':['recSALARIEE000001'],'Hôtel':['recAVECPAUSE00001'],'Prestations':['recPRESTATION0001'],Date:'2026-09-03',"Heure d'arrivée":'2026-09-03T07:00:00.000Z','Heure de départ':'2026-09-03T16:00:00.000Z',Statut:'Terminée',Observation:'[Départ régularisé par la salariée]'}},
  {id:'recPOINTAGE000002',fields:{'Pointage ID':2,'Salarié':['recSALARIEE000001'],'Hôtel':['recSANSPAUSE00001'],'Prestations':['recPRESTATION0001'],Date:'2026-09-04',"Heure d'arrivée":'2026-09-04T07:00:00.000Z','Heure de départ':'2026-09-04T12:00:00.000Z',Statut:'Terminée'}}],
 [T.AFF]:[{id:'recAFFECT00000001',fields:{'Salarié':['recSALARIEE000001'],'Hôtel':['recSANSPAUSE00001'],'Service prévu':['recPRESTATION0001'],'Date prévue':'2026-09-28','Heure prévue':'08:00',Commentaires:'Prendre les clés à la réception'}}]};
globalThis.fetch=async(url)=>{const[,,,t]=new URL(url).pathname.split('/');return{ok:true,status:200,json:async()=>({records:base[t]||[]})};};
const{default:cal}=await import('./api/_lib/routes-salarie/calendrier.js');
const{default:heu}=await import('./api/_lib/routes-salarie/heures.js');
const res=()=>{const r={code:200,corps:null};r.setHeader=()=>{};r.status=c=>{r.code=c;return r;};r.json=d=>{r.corps=d;return r;};return r;};
const call=async(h,q)=>{const r=res();await h({method:'GET',headers:{'x-jeton':'jeton-claudine-01'},query:q},r);return r;};
let ko=0;const V=(t,c,d='')=>{if(!c)ko+=1;console.log(`  ${c?'✅':'❌'} ${t}${d?`  → ${d}`:''}`);};

const c=(await call(cal,{mois:'2026-09'})).corps;
console.log('\n① Totaux du mois');
V('heures nettes',c.total.heures===13.5,`${c.total.heures} h`);
V('gains',c.total.gains===162,`${c.total.gains} €`);
V('missions',c.total.missions===2,`${c.total.missions}`);

console.log('\n② Journée chez un hôtel AVEC pause');
const j1=c.items.find(x=>x.date==='2026-09-03');
V('adresse complète',j1.adresse==='21 rue Lavoisier, 75008 Paris',j1.adresse);
V('9 h badgées → 8,5 h comptées',j1.duree===8.5&&j1.dureeBrute===9,`${j1.dureeBrute} → ${j1.duree}`);
V('la pause est annoncée',j1.pauseMinutes===30,`${j1.pauseMinutes} min`);
V('gain du jour',j1.gain===102,`${j1.gain} €`);
V('observation transmise',/régularisé/.test(j1.observation),j1.observation);

console.log('\n③ Journée chez un hôtel SANS pause');
const j2=c.items.find(x=>x.date==='2026-09-04');
V('5 h restent 5 h',j2.duree===5&&!j2.pauseMinutes,`${j2.duree} h`);
V('gain',j2.gain===60,`${j2.gain} €`);

console.log('\n④ Journée à venir');
const j3=c.items.find(x=>x.genre==='affectation');
V('adresse',j3.adresse==='45 rue Washington, 75008 Paris',j3.adresse);
V('consignes transmises',j3.commentaires==='Prendre les clés à la réception',j3.commentaires);
V('heure prévue',j3.heurePrevue==='08:00');

console.log('\n⑤ « Mes heures » compte comme la paie');
const h=(await call(heu,{})).corps;
V('mois en cours : 13,5 h, pas 14',h.moisCi.heures===13.5,`${h.moisCi.heures} h`);
V('gains cohérents',h.moisCi.gains===162,`${h.moisCi.gains} €`);
console.log(ko?`\n${ko} en échec.`:'\nToutes les vérifications passent.');
process.exit(ko?1:0);
