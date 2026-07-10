// ── Couche d'accès Airtable — base 5P STAR (appHlqfEa5sJhNixT) ─────────
export const BASE_ID = 'appHlqfEa5sJhNixT';
export const T = {
  SALARIES:      'tbl12XOxlZk1xFy5W',
  HOTELS:        'tbltHWrjqtIT8wn3I',
  PRESTATIONS:   'tbl63cY9itn3Lk1Ar',
  POINTAGES:     'tbl1srurt2A2Ges03',
  AFFECTATIONS:  'tblgLAcrlUoqhZ1td',
  CONSOLIDATIONS:'tblFmQMNPDGfHdHzX',
  FACTU_SALARIES:'tblNACqYkklNzzmFB',
};

const API = `https://api.airtable.com/v0/${BASE_ID}`;

async function atFetch(chemin, options = {}, tentative = 0) {
  const token = process.env.AIRTABLE_TOKEN?.trim();

  console.log('Diagnostic Airtable', {
    tokenPresent: Boolean(token),
    tokenPrefix: token?.slice(0, 3),
    tokenLength: token?.length,
    hasLeadingSpace: process.env.AIRTABLE_TOKEN
      ? process.env.AIRTABLE_TOKEN !== process.env.AIRTABLE_TOKEN.trimStart()
      : false,
    hasTrailingSpace: process.env.AIRTABLE_TOKEN
      ? process.env.AIRTABLE_TOKEN !== process.env.AIRTABLE_TOKEN.trimEnd()
      : false,
    chemin,
  });

  const res = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if ((res.status === 429 || res.status >= 500) && tentative < 3) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** tentative));
    return atFetch(chemin, options, tentative + 1);
  }

  const data = await res.json();

  if (!res.ok) {
    console.error('Erreur Airtable complète', {
      status: res.status,
      statusText: res.statusText,
      data,
      chemin,
    });

    const err = new Error(
      data?.error?.message || `Airtable ${res.status}`
    );

    err.status = res.status;
    throw err;
  }

  return data;
}

export async function lister(tableId, { formule, tri, champs } = {}) {
  const enregistrements = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (formule) params.set('filterByFormula', formule);
    if (offset) params.set('offset', offset);
    (champs || []).forEach((c) => params.append('fields[]', c));
    (tri || []).forEach((s, i) => {
      params.append(`sort[${i}][field]`, s.field);
      params.append(`sort[${i}][direction]`, s.direction || 'asc');
    });
    const data = await atFetch(`/${tableId}?${params}`);
    enregistrements.push(...data.records);
    offset = data.offset;
  } while (offset);
  return enregistrements;
}

export const modifier = (tableId, recordId, fields) =>
  atFetch(`/${tableId}/${recordId}`, { method: 'PATCH', body: JSON.stringify({ fields, typecast: true }) });
export const creer = (tableId, fields) =>
  atFetch(`/${tableId}`, { method: 'POST', body: JSON.stringify({ fields, typecast: true }) });

// ── Utilitaires ────────────────────────────────────────────────────────
export const F = (rec, nom) => rec?.fields?.[nom] ?? null;
export const lien = (rec, nom) => (rec?.fields?.[nom] || [])[0] || null;
export const echapper = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const aujourdhuiParis = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
export const heureParis = () =>
  new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

export const dureeHeures = (arrivee, depart) => {
  if (!arrivee || !depart) return null;
  return Math.round(((new Date(depart) - new Date(arrivee)) / 3_600_000) * 100) / 100;
};

export function lundiCourant() {
  const auj = new Date(aujourdhuiParis() + 'T12:00:00Z');
  const jour = (auj.getUTCDay() + 6) % 7;
  auj.setUTCDate(auj.getUTCDate() - jour);
  return auj.toISOString().slice(0, 10);
}

export function moisDecale(mois, delta) {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function referentiels() {
  const [salaries, hotels, prestations] = await Promise.all([
    lister(T.SALARIES), lister(T.HOTELS), lister(T.PRESTATIONS),
  ]);
  const index = (rs) => Object.fromEntries(rs.map((r) => [r.id, r]));
  return {
    salaries, hotels, prestations,
    iSalaries: index(salaries), iHotels: index(hotels), iPrestations: index(prestations),
  };
}

export function lirePointage(p, refs) {
  const salarie = refs.iSalaries?.[lien(p, 'Salarié')];
  const hotel = refs.iHotels[lien(p, 'Hôtel')];
  const presta = refs.iPrestations[lien(p, 'Prestations')];
  const arrivee = F(p, "Heure d'arrivée");
  const depart = F(p, 'Heure de départ');
  let statut = F(p, 'Statut');
  if (!statut) statut = depart ? 'Terminée' : 'En cours';
  return {
    id: p.id,
    salarieId: lien(p, 'Salarié'),
    salarie: salarie ? F(salarie, 'Nom') : '—',
    telephone: salarie ? F(salarie, 'Téléphone') : null,
    tauxHoraireSalarie: salarie ? F(salarie, 'Taux Horaire') : null,
    hotelId: lien(p, 'Hôtel'),
    hotel: hotel ? F(hotel, 'Nom') : '—',
    prestationId: lien(p, 'Prestations'),
    prestation: presta ? F(presta, 'Type de prestation') : '—',
    tarifFacturation: presta ? F(presta, 'Tarif horaire facturation') : null,
    date: F(p, 'Date') || (arrivee ? arrivee.slice(0, 10) : null),
    arrivee, depart, statut,
    duree: dureeHeures(arrivee, depart),
    observation: F(p, 'Observation') || '',
  };
}

export function envoyerErreur(res, err) {
  console.error(err);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.message || 'Erreur serveur' });
}
