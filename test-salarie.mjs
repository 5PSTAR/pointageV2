// Harnais phase 1 — Airtable simulé, avec état mutable (créer / modifier).
process.env.AIRTABLE_TOKEN = 'faux';

const T = { SAL: 'tbl12XOxlZk1xFy5W', HOT: 'tbltHWrjqtIT8wn3I', PRE: 'tbl63cY9itn3Lk1Ar', PTG: 'tbl1srurt2A2Ges03', AFF: 'tblgLAcrlUoqhZ1td' };
let base, seq;

function reinitialiser() {
  seq = 0;
  base = {
    [T.SAL]: [
      { id: 'recSALARIEE000001', fields: { Nom: 'Claudine Martin', Jeton: 'jeton-claudine-01', 'Taux Horaire': 12 } },
      // Homonyme volontaire : c'est le cas qui cassait l'ancien filtrage par nom.
      { id: 'recSALARIEE000002', fields: { Nom: 'Claudine Martin', Jeton: 'jeton-claudine-02', 'Taux Horaire': 13 } },
    ],
    [T.HOT]: [
      { id: 'recHOTEL000000001', fields: { Nom: 'Hôtel Arc Elysées', Ville: 'Paris', 'Catégorie': '4 étoiles' } },
      { id: 'recHOTEL000000002', fields: { Nom: 'Le Clos Medicis', Ville: 'Paris', 'Catégorie': '3 étoiles' } },
    ],
    [T.PRE]: [
      { id: 'recPRESTATION0001', fields: { 'Type de prestation': 'Femme de chambre' } },
      { id: 'recPRESTATION0002', fields: { 'Type de prestation': 'Petits déjeuners' } },
    ],
    [T.PTG]: [],
    [T.AFF]: [],
  };
}

// ── fetch stubbé : lecture filtrée grossièrement, écriture réelle ──
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const [, , , table, recId] = u.pathname.split('/');
  const methode = options.method || 'GET';
  const corps = options.body ? JSON.parse(options.body) : null;
  const ok = (data) => ({ ok: true, status: 200, json: async () => data });

  if (methode === 'POST') {
    seq += 1;
    const rec = { id: `recNEW${String(seq).padStart(11, '0')}`, fields: corps.fields };
    base[table].push(rec);
    return ok(rec);
  }
  if (methode === 'PATCH') {
    const rec = base[table].find((r) => r.id === recId);
    rec.fields = { ...rec.fields, ...corps.fields };
    return ok(rec);
  }
  if (recId) return ok(base[table].find((r) => r.id === recId) || null);

  // Lecture : on n'applique que les filtres que le code utilise réellement.
  const formule = u.searchParams.get('filterByFormula') || '';
  let rs = base[table];
  const statut = formule.match(/\{Statut\} = '([^']+)'/);
  if (statut) rs = rs.filter((r) => r.fields.Statut === statut[1]);
  const nom = formule.match(/\{Salarié\} = '([^']+)'/);
  if (nom) {
    const ids = base[T.SAL].filter((s) => s.fields.Nom === nom[1]).map((s) => s.id);
    rs = rs.filter((r) => (r.fields['Salarié'] || []).some((x) => ids.includes(x)));
  }
  const jeton = formule.match(/\{Jeton\} = '([^']+)'/);
  if (jeton) rs = rs.filter((r) => r.fields.Jeton === jeton[1]);
  return ok({ records: rs });
};

const { default: scan } = await import('./api/_lib/routes-salarie/scan.js');
const { default: regulariser } = await import('./api/_lib/routes-salarie/regulariser.js');
const { default: accueil } = await import('./api/_lib/routes-salarie/accueil.js');

function fauxRes() {
  const r = { code: 200, corps: null };
  r.setHeader = () => {};
  r.status = (c) => { r.code = c; return r; };
  r.json = (d) => { r.corps = d; return r; };
  r.send = (d) => { r.corps = d; return r; };
  return r;
}
const appel = async (h, body, jeton = 'jeton-claudine-01') => {
  const res = fauxRes();
  await h({ method: 'POST', headers: { 'x-jeton': jeton }, body, query: {} }, res);
  return res;
};
const lire = async (jeton = 'jeton-claudine-01') => {
  const res = fauxRes();
  await accueil({ method: 'GET', headers: { 'x-jeton': jeton }, query: {} }, res);
  return res;
};

const ptg = () => base[T.PTG];
const ilYa = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
let ko = 0;
const V = (libelle, condition, detail = '') => {
  if (!condition) ko += 1;
  console.log(`  ${condition ? '✅' : '❌'} ${libelle}${detail ? `  → ${detail}` : ''}`);
};

// ═══ 1 — Arrivée sans planning : la prestation est demandée ═══
reinitialiser();
console.log('\n① Arrivée sans planning');
let r = await appel(scan, { contenu: 'PTG:recHOTEL000000001' });
V('le serveur demande la prestation', r.corps.action === 'choisir-prestation', r.corps.action);
V('aucun pointage créé tant qu\'elle manque', ptg().length === 0);
r = await appel(scan, { contenu: 'PTG:recHOTEL000000001', prestationId: 'recPRESTATION0001' });
V('arrivée enregistrée après le choix', r.corps.action === 'arrivee' && ptg().length === 1, r.corps.action);
V('statut En cours', ptg()[0].fields.Statut === 'En cours');

// ═══ 2 — Double scan : le garde-fou protège la prestation ═══
console.log('\n② Double scan dans la foulée');
r = await appel(scan, { contenu: 'PTG:recHOTEL000000001' });
V('demande confirmation au lieu de clôturer', r.corps.action === 'confirmer-depart', r.corps.action);
V('la mission est toujours ouverte', ptg()[0].fields.Statut === 'En cours');
r = await appel(scan, { contenu: 'PTG:recHOTEL000000001', confirmerDepart: true });
V('clôture si la salariée confirme', r.corps.action === 'depart' && ptg()[0].fields.Statut === 'Terminée');

// ═══ 3 — Journée normale ═══
reinitialiser();
console.log('\n③ Journée normale de 6 h');
await appel(scan, { contenu: 'PTG:recHOTEL000000001', prestationId: 'recPRESTATION0001', horodatage: ilYa(6) });
r = await appel(scan, { contenu: 'PTG:recHOTEL000000001' });
V('départ direct, sans confirmation', r.corps.action === 'depart', r.corps.action);
V('durée ≈ 6 h', Math.abs(r.corps.duree - 6) < 0.02, `${r.corps.duree} h`);

// ═══ 4 — File hors-ligne rejouée plus tard ═══
reinitialiser();
console.log('\n④ Pointages différés (file hors-ligne)');
const arr = ilYa(9), dep = ilYa(4);
await appel(scan, { contenu: 'PTG:recHOTEL000000002', prestationId: 'recPRESTATION0002', horodatage: arr });
r = await appel(scan, { contenu: 'PTG:recHOTEL000000002', horodatage: dep });
V('durée calculée sur les heures de scan, pas d\'envoi', Math.abs(r.corps.duree - 5) < 0.02, `${r.corps.duree} h`);
V("heure d'arrivée = celle du scan", ptg()[0].fields["Heure d'arrivée"] === arr);
V('heure de départ = celle du scan', ptg()[0].fields['Heure de départ'] === dep);

// ═══ 5 — Horodatages aberrants ═══
reinitialiser();
console.log('\n⑤ Horodatages aberrants');
await appel(scan, { contenu: 'PTG:recHOTEL000000001', prestationId: 'recPRESTATION0001', horodatage: '2019-01-01T08:00:00.000Z' });
const ecart = Math.abs(new Date(ptg()[0].fields["Heure d'arrivée"]) - Date.now());
V('un horodatage trop vieux est ignoré', ecart < 60_000, `${Math.round(ecart / 1000)} s d'écart`);
r = await appel(scan, { contenu: 'PTG:recHOTEL000000001', horodatage: ilYa(-3), confirmerDepart: true });
V('un départ dans le futur ne donne pas de durée négative', r.corps.duree >= 0, `${r.corps.duree} h`);

// ═══ 6 — Homonymes ═══
reinitialiser();
console.log('\n⑥ Deux salariées portant le même nom');
await appel(scan, { contenu: 'PTG:recHOTEL000000001', prestationId: 'recPRESTATION0001' }, 'jeton-claudine-01');
r = await appel(scan, { contenu: 'PTG:recHOTEL000000002', prestationId: 'recPRESTATION0002' }, 'jeton-claudine-02');
V("l'homonyme ouvre SA mission", r.corps.action === 'arrivee' && ptg().length === 2, r.corps.action || r.corps.error);
V('chacune est liée au bon identifiant',
  ptg()[0].fields['Salarié'][0] === 'recSALARIEE000001' && ptg()[1].fields['Salarié'][0] === 'recSALARIEE000002');

// ═══ 7 — Mission ouverte ailleurs ═══
console.log('\n⑦ QR d\'un autre hôtel alors qu\'une mission est ouverte');
r = await appel(scan, { contenu: 'PTG:recHOTEL000000002' }, 'jeton-claudine-01');
V('refus explicite', r.code === 409, `${r.code} — ${r.corps.error || ''}`);

// ═══ 8 — Régularisation d'un départ oublié ═══
reinitialiser();
console.log('\n⑧ Départ oublié, déclaré à la main');
await appel(scan, { contenu: 'PTG:recHOTEL000000001', prestationId: 'recPRESTATION0001', horodatage: ilYa(20) });
const id = ptg()[0].id;
r = await appel(regulariser, { pointageId: id, heure: '25:00' });
V('heure invalide refusée', r.code === 400, `${r.code}`);
r = await appel(regulariser, { pointageId: id, heure: '09:00' }, 'jeton-claudine-02');
V("une collègue ne peut pas clôturer", r.code === 403, `${r.code}`);
const arrivee = new Date(ptg()[0].fields["Heure d'arrivée"]);
const hParis = (d, delta) => new Date(d.getTime() + delta * 3_600_000)
  .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
r = await appel(regulariser, { pointageId: id, heure: hParis(arrivee, 14) });
V('durée invraisemblable refusée', r.code === 400, `${r.code} — ${r.corps.error || ''}`);
r = await appel(regulariser, { pointageId: id, heure: hParis(arrivee, 5) });
V('régularisation acceptée', r.code === 200 && r.corps.ok, `${r.code} — ${r.corps.error || r.corps.message}`);
V('durée ≈ 5 h', Math.abs(r.corps.duree - 5) < 0.03, `${r.corps.duree} h`);
V('statut Terminée', ptg()[0].fields.Statut === 'Terminée');
V('saisie tracée dans Observation', /régularisé par la salariée/.test(ptg()[0].fields.Observation || ''), ptg()[0].fields.Observation);
r = await appel(regulariser, { pointageId: id, heure: hParis(arrivee, 5) });
V('deuxième régularisation refusée', r.code === 409, `${r.code}`);

// ═══ 9 — Données servies à l'app pour le mode hors-ligne ═══
console.log('\n⑨ /accueil alimente le mode secours');
r = await lire();
V('liste des hôtels servie', Array.isArray(r.corps.hotels) && r.corps.hotels.length === 2, `${r.corps.hotels?.length}`);
V('liste des prestations servie', r.corps.prestations?.length === 2, `${r.corps.prestations?.length}`);
V('hôtels triés par nom', r.corps.hotels[0].nom < r.corps.hotels[1].nom, r.corps.hotels.map((h) => h.nom).join(' · '));

// ═══ 10 — QR étranger ═══
console.log('\n⑩ QR qui n\'est pas un QR 5P STAR');
r = await appel(scan, { contenu: 'https://exemple.fr/promo' });
V('refusé sans ambiguïté', r.code === 400, `${r.code} — ${r.corps.error}`);

console.log(ko ? `\n${ko} vérification(s) en échec.` : '\nToutes les vérifications passent.');
process.exit(ko ? 1 : 0);
