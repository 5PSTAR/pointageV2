// ═══ Harnais de test — simule Airtable avec la structure réelle de la base ═══
process.env.AIRTABLE_TOKEN = 'pat-test';
process.env.APP_URL = 'https://pointage-5pstar.vercel.app';

const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
const hier = new Date(Date.now() - 86400000).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
const mois = auj.slice(0, 7);
const moisDernier = (() => { const [a,m]=mois.split('-').map(Number); const d=new Date(Date.UTC(a,m-2,1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; })();

const TABLES = {
  tbl12XOxlZk1xFy5W: [ // Salariés (avec Jeton = règle d'or)
    { id: 'recCAM', fields: { 'Nom': 'Camille Lefevre', 'Téléphone': '+33645678901', 'Taux Horaire': 13, 'Jeton': 'JETON-CAMILLE-0001' } },
    { id: 'recJUL', fields: { 'Nom': 'Julien Petit', 'Téléphone': '+33656789012', 'Taux Horaire': 12.5, 'Jeton': 'JETON-JULIEN-00002' } },
  ],
  tbltHWrjqtIT8wn3I: [
    { id: 'recRELAIS00000001', fields: { 'Nom': 'Le Relais Montagnard', 'Adresse': '2 Rue des Alpes, Chamonix' } },
    { id: 'recCHATEAU0000001', fields: { 'Nom': 'Château de la Loire', 'Adresse': '1 Route du Château, Blois' } },
  ],
  tbl63cY9itn3Lk1Ar: [
    { id: 'recFDC', fields: { 'Type de prestation': 'Femme de chambre', 'Tarif horaire facturation': 22 } },
    { id: 'recPDJ', fields: { 'Type de prestation': 'Petits déjeuners', 'Tarif horaire facturation': 18 } },
  ],
  tbl1srurt2A2Ges03: [
    // Camille : terminée hier 5,25 h + mission EN COURS aujourd'hui au Relais
    { id: 'recP1', fields: { 'Salarié': ['recCAM'], 'Hôtel': ['recRELAIS00000001'], 'Prestations': ['recFDC'], 'Date': hier, "Heure d'arrivée": `${hier}T06:00:00.000Z`, 'Heure de départ': `${hier}T11:15:00.000Z`, 'Statut': 'Terminée' } },
    { id: 'recP2', fields: { 'Salarié': ['recCAM'], 'Hôtel': ['recRELAIS00000001'], 'Prestations': ['recFDC'], 'Date': auj, "Heure d'arrivée": `${auj}T06:00:00.000Z`, 'Statut': 'En cours' } },
    // Julien : terminée aujourd'hui 3,25 h au Château + mois dernier 4 h
    { id: 'recP3', fields: { 'Salarié': ['recJUL'], 'Hôtel': ['recCHATEAU0000001'], 'Prestations': ['recPDJ'], 'Date': auj, "Heure d'arrivée": `${auj}T04:30:00.000Z`, 'Heure de départ': `${auj}T07:45:00.000Z`, 'Statut': 'Terminée' } },
    { id: 'recP4', fields: { 'Salarié': ['recJUL'], 'Hôtel': ['recCHATEAU0000001'], 'Prestations': ['recPDJ'], 'Date': `${moisDernier}-15`, "Heure d'arrivée": `${moisDernier}-15T04:00:00.000Z`, 'Heure de départ': `${moisDernier}-15T08:00:00.000Z`, 'Statut': 'Terminée' } },
  ],
  tblgLAcrlUoqhZ1td: [
    // Julien a une affectation aujourd'hui au Relais (pour la déduction de prestation au scan)
    { id: 'recA1', fields: { 'Salarié': ['recJUL'], 'Hôtel': ['recRELAIS00000001'], 'Service prévu': ['recFDC'], 'Date prévue': auj, 'Heure prévue': '06:00' } },
  ],
  tblFmQMNPDGfHdHzX: [], tblNACqYkklNzzmFB: [],
};

const ecrits = [];
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const parts = u.pathname.split('/');
  const tableId = parts[3];
  const recordId = parts[4];
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  if (options.method === 'PATCH' || options.method === 'POST') {
    const body = JSON.parse(options.body);
    ecrits.push({ tableId, recordId, method: options.method, body });
    if (options.method === 'POST') {
      const rec = { id: 'recNOUVEAU' + ecrits.length, fields: body.fields };
      TABLES[tableId]?.push(rec);
      return ok(rec);
    }
    const cible = TABLES[tableId]?.find((r) => r.id === recordId);
    if (cible) Object.assign(cible.fields, body.fields);
    return ok({ id: recordId });
  }
  const formule = u.searchParams.get('filterByFormula') || '';
  let records = TABLES[tableId] || [];
  // Filtre jeton (auth salarié)
  const mJeton = formule.match(/\{Jeton\} = '([^']+)'/);
  if (mJeton) records = records.filter((r) => r.fields['Jeton'] === mJeton[1]);
  // Filtre nom salarié
  const mNom = formule.match(/\{Salarié\} = '((?:[^'\\]|\\.)+)'/);
  if (mNom) { const nom = mNom[1].replace(/\\'/g, "'"); records = records.filter((r) => !r.fields['Salarié'] || TABLES.tbl12XOxlZk1xFy5W.find((s) => s.id === r.fields['Salarié'][0])?.fields['Nom'] === nom); }
  // Filtre statut
  const mStatut = formule.match(/\{Statut\} = '([^']+)'/);
  if (mStatut) records = records.filter((r) => r.fields['Statut'] === mStatut[1]);
  // Filtres date (mois via DATETIME_FORMAT, jour via IS_SAME) — on matche TOUTES les valeurs
  const moisVoulus = [...formule.matchAll(/= '(\d{4}-\d{2})'/g)].map((m) => m[1]);
  if (moisVoulus.length) records = records.filter((r) => {
    const d = r.fields["Heure d'arrivée"] || r.fields['Date prévue'] || '';
    return moisVoulus.some((mv) => d.startsWith(mv));
  });
  const mJour = formule.match(/IS_SAME\(\{[^}]+\}, '(\d{4}-\d{2}-\d{2})'/);
  if (mJour) records = records.filter((r) => (r.fields['Date prévue'] || r.fields["Heure d'arrivée"] || '').startsWith(mJour[1]));
  return ok({ records });
};

function fauxRes() {
  const res = { statusCode: 200, headers: {}, corps: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.corps = b; return res; };
  res.send = (b) => { res.corps = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  return res;
}
const reqS = (jeton, extra = {}) => ({ method: 'GET', query: {}, headers: { 'x-jeton': jeton }, ...extra });
const reqA = (extra = {}) => ({ method: 'GET', query: {}, headers: {}, ...extra });

let echecs = 0;
const test = (nom, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${nom}${detail ? ' — ' + String(detail) : ''}`);
  if (!cond) echecs++;
};

// ═══ APP SALARIÉE ═══
const accueil = (await import('./api/salarie/accueil.js')).default;
let r = fauxRes();
await accueil(reqS('JETON-INEXISTANT-XX'), r);
test('Salarié : jeton inconnu rejeté (401)', r.statusCode === 401);

r = fauxRes();
await accueil(reqS('JETON-CAMILLE-0001'), r);
test('Accueil : profil reconnu par jeton (règle d\'or)', r.corps?.profil?.nom === 'Camille Lefevre');
test('Accueil : mission en cours détectée', r.corps?.enCours?.hotel === 'Le Relais Montagnard');

const scan = (await import('./api/salarie/scan.js')).default;
// Julien scanne le Relais (affectation prévue → prestation déduite automatiquement)
r = fauxRes();
await scan(reqS('JETON-JULIEN-00002', { method: 'POST', body: { contenu: 'PTG:recRELAIS00000001' } }), r);
test('Scan arrivée : prestation déduite de l\'affectation du jour', r.corps?.action === 'arrivee' && r.corps?.prestation === 'Femme de chambre', JSON.stringify(r.corps));
const creation = ecrits.find((e) => e.method === 'POST' && e.tableId === 'tbl1srurt2A2Ges03');
test('Scan arrivée : pointage créé En cours avec salarié + hôtel liés', creation && creation.body.fields['Statut'] === 'En cours' && creation.body.fields['Salarié'][0] === 'recJUL');

// Julien re-scanne le MÊME hôtel → départ
r = fauxRes();
await scan(reqS('JETON-JULIEN-00002', { method: 'POST', body: { contenu: `${process.env.APP_URL}/q/recRELAIS00000001` } }), r);
test('Scan départ : re-scan même hôtel clôture la mission (format URL accepté)', r.corps?.action === 'depart' && r.corps?.duree >= 0);

// Camille (mission ouverte au Relais) scanne le Château → refus explicite
r = fauxRes();
await scan(reqS('JETON-CAMILLE-0001', { method: 'POST', body: { contenu: 'PTG:recCHATEAU0000001' } }), r);
test('Scan : hôtel différent avec mission ouverte → 409 + message clair', r.statusCode === 409 && /Relais/.test(r.corps?.error));

// Camille clôture au Relais, puis scanne le Château SANS affectation → choix de prestation
r = fauxRes();
await scan(reqS('JETON-CAMILLE-0001', { method: 'POST', body: { contenu: 'PTG:recRELAIS00000001' } }), r);
test('Scan : Camille clôture sa mission au Relais', r.corps?.action === 'depart');
r = fauxRes();
await scan(reqS('JETON-CAMILLE-0001', { method: 'POST', body: { contenu: 'PTG:recCHATEAU0000001' } }), r);
test('Scan : sans affectation → l\'app demande la prestation', r.corps?.action === 'choisir-prestation' && r.corps?.prestations?.length === 2);
r = fauxRes();
await scan(reqS('JETON-CAMILLE-0001', { method: 'POST', body: { contenu: 'PTG:recCHATEAU0000001', prestationId: 'recPDJ' } }), r);
test('Scan : arrivée validée après choix manuel de prestation', r.corps?.action === 'arrivee' && r.corps?.prestation === 'Petits déjeuners');

r = fauxRes();
await scan(reqS('JETON-CAMILLE-0001', { method: 'POST', body: { contenu: 'https://site-pirate.fr/autre' } }), r);
test('Scan : contenu non 5P STAR rejeté', r.statusCode === 400);

// Heures et gains — Julien : mois-ci 3,25 h × 12,5 = 40,63 € ; mois dernier 4 h = 50 €
const heures = (await import('./api/salarie/heures.js')).default;
r = fauxRes();
await heures(reqS('JETON-JULIEN-00002'), r);
test('Heures : gains du mois = 40,63 € (3,25 h × 12,50 €)', r.corps?.moisCi?.gains === 40.63, r.corps?.moisCi?.gains);
test('Heures : mois dernier = 50 € (4 h)', r.corps?.moisDer?.gains === 50 && r.corps?.moisDer?.heures === 4);
test('Heures : semaine ⊆ mois', r.corps?.semaine?.heures <= r.corps?.moisCi?.heures);

const missions = (await import('./api/salarie/missions.js')).default;
r = fauxRes();
await missions(reqS('JETON-CAMILLE-0001'), r);
test('Missions : historique isolé par salariée (pas de fuite)', r.corps?.historique?.every((p) => !['recP3', 'recP4'].includes(p.id)));

const calS = (await import('./api/salarie/calendrier.js')).default;
r = fauxRes();
await calS(reqS('JETON-CAMILLE-0001', { query: { mois } }), r);
test('Calendrier salarié : items du mois avec statuts', r.corps?.items?.length >= 2 && r.corps.items.every((i) => i.statut && i.date));

// ═══ PANNEAU ADMIN (sans authentification, conformément au brief) ═══
const dash = (await import('./api/admin/dashboard.js')).default;
r = fauxRes();
await dash(reqA(), r);
test('Admin : dashboard accessible sans mot de passe', r.statusCode === 200 && r.corps?.kpi);
test('Admin : KPI chiffre du mois calculé (heures × tarifs)', typeof r.corps?.kpi?.chiffreMois === 'number' && r.corps.kpi.chiffreMois > 0, r.corps?.kpi?.chiffreMois);
test('Admin : alertes avec téléphone pour « Appeler »', r.corps?.alertes !== undefined);

const pointagesAdmin = (await import('./api/admin/pointages.js')).default;
r = fauxRes();
await pointagesAdmin(reqA({ query: { mois } }), r);
test('Admin pointages : liste avec arrivée/départ/statut', r.corps?.pointages?.length >= 3 && r.corps.pointages.every((p) => p.statut));
r = fauxRes();
await pointagesAdmin(reqA({ method: 'PATCH', body: { id: 'recP1', statut: 'Anomalie', observation: 'test' } }), r);
const patch = ecrits.filter((e) => e.method === 'PATCH').find((e) => e.recordId === 'recP1');
test('Admin pointages : rectification tracée « Modifié par admin »', r.corps?.ok && /Modifié par admin/.test(patch?.body.fields['Observation']));

const facture = (await import('./api/admin/facture.js')).default;
r = fauxRes();
await facture(reqA({ query: { hotel: 'recCHATEAU0000001', mois } }), r);
test('Facture : agrégation par prestation × tarif global', r.corps?.lignes?.length >= 1 && r.corps.totalHT > 0, r.corps?.totalHT);
r = fauxRes();
await facture(reqA({ query: { hotel: 'recCHATEAU0000001', mois, format: 'pdf' } }), r);
test('Facture : export PDF valide', Buffer.isBuffer(r.corps) && r.corps.slice(0, 4).toString() === '%PDF');
r = fauxRes();
await facture(reqA({ query: { hotel: 'recCHATEAU0000001', mois, format: 'xlsx' } }), r);
test('Facture : export Excel valide', Buffer.isBuffer(r.corps) && r.corps[0] === 0x50 && r.corps[1] === 0x4b);

const budget = (await import('./api/admin/budget.js')).default;
r = fauxRes();
await budget(reqA({ query: { mois } }), r);
test('Budget : coût par salariée + total consolidé', r.corps?.lignes?.length >= 1 && r.corps.total > 0, r.corps?.total);
r = fauxRes();
await budget(reqA({ query: { mois, format: 'pdf' } }), r);
test('Budget : export PDF valide', Buffer.isBuffer(r.corps) && r.corps.slice(0, 4).toString() === '%PDF');

const qrcodes = (await import('./api/admin/qrcodes.js')).default;
r = fauxRes();
await qrcodes(reqA(), r);
test('QR : un par hôtel, contenu = URL /q/{hotelId} (indépendant salarié/prestation)',
  r.corps?.qrcodes?.length === 2 && r.corps.qrcodes.every((q) => /\/q\/rec[A-Za-z0-9]{14}$/.test(q.contenu)));
test('QR : images PNG générées', r.corps?.qrcodes?.every((q) => q.image.startsWith('data:image/png')));

console.log(echecs === 0 ? '\n🎉 TOUS LES TESTS PASSENT' : `\n⚠️ ${echecs} test(s) en échec`);
process.exit(echecs === 0 ? 0 : 1);
