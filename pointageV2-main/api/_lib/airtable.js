// ── Couche d'accès Airtable — base 5P STAR ────────────────────────────
// La base cible est configurable : AIRTABLE_BASE dans les variables Vercel.
export const BASE_ID = process.env.AIRTABLE_BASE || 'app79m9PEiSw8iHWn';
export const T = {
  SALARIES:      'tbl12XOxlZk1xFy5W',
  HOTELS:        'tbltHWrjqtIT8wn3I',
  PRESTATIONS:   'tbl63cY9itn3Lk1Ar',
  POINTAGES:     'tbl1srurt2A2Ges03',
  AFFECTATIONS:  'tblgLAcrlUoqhZ1td',
  CONSOLIDATIONS:'tblFmQMNPDGfHdHzX',
  FACTU_SALARIES:'tblNACqYkklNzzmFB',
  FACTURES:      'tblqw9ieeljA8iPb7',
  RELANCES:      'tblaxyhAkr7BFBYcC',
  CONTRATS:      'tblE5utP1UAfBTqx4',
};

// ── Tarification par catégorie d'hôtel ────────────────────────────────
// Le tarif horaire dépend du classement de l'hôtel : un 3 étoiles et un
// 4 étoiles ne paient pas la même prestation au même prix. La table
// Prestations porte une colonne par catégorie ; l'hôtel porte la sienne.
export const TARIF_PAR_CATEGORIE = {
  '3 étoiles': 'Tarif 3 étoiles',
  '4 étoiles': 'Tarif 4 étoiles',
};

/** Airtable renvoie une liste déroulante en texte via l'API REST, en objet ailleurs. */
export const nomOption = (v) => (v && typeof v === 'object' ? v.name : v) || null;

/**
 * Tarif horaire applicable, croisement d'une prestation et d'un hôtel.
 * Renvoie null si l'hôtel n'a pas de catégorie ou si la case tarif est vide :
 * l'appelant doit alors signaler un tarif manquant plutôt que facturer à 0.
 */
export function tarifApplicable(prestation, hotel) {
  const categorie = nomOption(F(hotel, 'Catégorie'));
  const champ = TARIF_PAR_CATEGORIE[categorie];
  if (!champ) return null;
  const tarif = F(prestation, champ);
  return Number.isFinite(tarif) ? tarif : null;
}

const API = `https://api.airtable.com/v0/${BASE_ID}`;

async function atFetch(chemin, options = {}, tentative = 0) {
  const res = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if ((res.status === 429 || res.status >= 500) && tentative < 3) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** tentative));
    return atFetch(chemin, options, tentative + 1);
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Airtable ${res.status}`);
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

export const lire = (tableId, recordId) => atFetch(`/${tableId}/${recordId}`);
export const modifier = (tableId, recordId, fields) =>
  atFetch(`/${tableId}/${recordId}`, { method: 'PATCH', body: JSON.stringify({ fields, typecast: true }) });
export const creer = (tableId, fields) =>
  atFetch(`/${tableId}`, { method: 'POST', body: JSON.stringify({ fields, typecast: true }) });
export const supprimer = (tableId, recordId) =>
  atFetch(`/${tableId}/${recordId}`, { method: 'DELETE' });

/** Upload d'une pièce jointe (photo) en base64 via l'API contenu d'Airtable. */
export async function uploaderPieceJointe(recordId, fieldId, { base64, contentType, filename }) {
  const res = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contentType, file: base64, filename }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Airtable upload ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Utilitaires ────────────────────────────────────────────────────────
export const F = (rec, nom) => rec?.fields?.[nom] ?? null;
export const lien = (rec, nom) => (rec?.fields?.[nom] || [])[0] || null;
export const echapper = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Date civile parisienne d'un instant donné — un scan différé garde SA date. */
export const dateParis = (d = new Date()) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
export const aujourdhuiParis = () => dateParis();
/**
 * Instant correspondant à une heure murale parisienne (« 17:30 le 12/09 »).
 * Vercel tourne en UTC : construire la date naïvement décalerait le départ
 * d'une ou deux heures selon la saison, donc la durée facturée.
 */
export function instantParis(jour, heure) {
  const suppose = new Date(`${jour}T${heure}:00Z`);
  const vuParis = new Date(suppose.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const vuUtc = new Date(suppose.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(suppose.getTime() - (vuParis - vuUtc));
}

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
    // Numéro lisible du pointage, pour faire le lien depuis une facture.
    numero: F(p, 'Pointage ID'),
    salarieId: lien(p, 'Salarié'),
    salarie: salarie ? F(salarie, 'Nom') : '—',
    telephone: salarie ? F(salarie, 'Téléphone') : null,
    tauxHoraireSalarie: salarie ? F(salarie, 'Taux Horaire') : null,
    hotelId: lien(p, 'Hôtel'),
    hotel: hotel ? F(hotel, 'Nom') : '—',
    prestationId: lien(p, 'Prestations'),
    prestation: presta ? nomOption(F(presta, 'Type de prestation')) : '—',
    categorieHotel: hotel ? nomOption(F(hotel, 'Catégorie')) : null,
    tarifFacturation: presta && hotel ? tarifApplicable(presta, hotel) : null,
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

