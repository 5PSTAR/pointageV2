// Onglet Facturation — pilotage : liste, indicateurs, génération, encaissement.
// GET   ?periode=mois&mois=AAAA-MM   → un mois
// GET   ?periode=annee&annee=AAAA     → une année entière
// GET   ?periode=tout                 → tout l'historique
//       (+ &hotel=recX pour restreindre à un hôtel)
// GET   ?facture=recX                → détail d'une facture (lignes + relances)
// POST  { mois, hotel? }             → génère les factures manquantes du mois
// PATCH { id, action, … }            → envoyer | payer | annuler | avoir
//
// Règle de fond : une facture est un instantané. Total, détail et taux de TVA
// sont figés à la génération ; corriger un pointage après coup ne modifie plus
// une facture déjà émise.
import {
  F, T, aujourdhuiParis, creer, echapper, envoyerErreur, lien, lirePointage, lister, modifier, moisDecale, nomOption, referentiels,
} from '../airtable.js';

// La table Factures nomme « Client » son lien vers la table Clients — l'ancien
// « Hôtel » a disparu quand la base s'est ouverte aux copropriétés et cabinets.
// Écrire ou lire l'ancien nom échoue en silence à la lecture, et par un refus
// d'Airtable à l'écriture : aucune facture ne peut plus être générée.
export const CHAMP_CLIENT = 'Client';

// La pause vit dans son propre module : la paie et l'app salariée l'appliquent
// aussi, et elles n'ont rien à faire d'importer tout le moteur de facturation.
export { appliquerPause, appliquerPauseParClient, PRESENCE_MIN_POUR_PAUSE_H } from '../pause.js';
import { appliquerPause, appliquerPauseParClient } from '../pause.js';

// ── Modes de facturation ──────────────────────────────────────────────
// Les trois libellés vivent ici et nulle part ailleurs. Le test est TOUJOURS
// positif : on n'écarte un client de la facturation horaire que si son mode est
// reconnu comme l'un des deux autres. Une valeur inattendue — faute de frappe,
// option renommée dans Airtable — le laisse facturable, c'est-à-dire visible.
// L'inverse arrêterait toute la facturation sans le moindre message.
export const MODE_HORAIRE = 'Pointage horaire';
export const MODE_RECURRENT = 'Récurrent';
export const MODE_LIBRE = 'Libre';

export const modeFacturation = (client) => nomOption(F(client, 'Mode de facturation')) || MODE_HORAIRE;
export const estRecurrent = (client) => modeFacturation(client) === MODE_RECURRENT;

export const TVA_DEFAUT = 0.20;
export const DELAI_DEFAUT = 30;           // jours, si l'hôtel n'en précise pas
const SEUILS_RELANCE = [[25, 3], [15, 2], [5, 1]];   // [jours de retard, niveau]
// Ces seuils doivent rester identiques à ceux du champ « Relance conseillée »
// de la table Factures, sinon Airtable et l'application se contrediraient.

const arrondi = (n) => Math.round(n * 100) / 100;
const moisDeLaFacture = (mois) => `${mois}-01`;

/**
 * Traduit une période en filtre Airtable. Sans filtre pour « tout » : on
 * ramène l'historique complet, la base restant de taille modeste.
 */
function formulePeriode(champ, { periode, mois, annee }) {
  if (periode === 'annee' && /^\d{4}$/.test(annee || '')) {
    return `DATETIME_FORMAT({${champ}}, 'YYYY') = '${annee}'`;
  }
  if (periode === 'tout') return undefined;
  return `DATETIME_FORMAT({${champ}}, 'YYYY-MM') = '${mois}'`;
}

/** Dernier jour du mois facturé — c'est la date portée sur le document. */
function finDeMois(mois) {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}
function ajouterJours(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function ecartJours(depuis, jusqua) {
  return Math.round((new Date(jusqua + 'T12:00:00Z') - new Date(depuis + 'T12:00:00Z')) / 86_400_000);
}

// ── Statut ────────────────────────────────────────────────────────────
// Trois états seulement sont écrits dans Airtable. « En attente » et
// « En retard » se déduisent des dates, sinon il faudrait un robot nocturne
// pour les tenir à jour — et un statut périmé est pire que pas de statut.
export function statutFacture(rec, auj) {
  const brut = nomOption(F(rec, 'Statut'));
  if (brut === 'Annulée') return 'annulee';
  if (brut === 'Avoir') return 'avoir';
  if (F(rec, 'Date de paiement')) return 'payee';
  if (!F(rec, "Date d'envoi")) return 'brouillon';
  const echeance = F(rec, "Date d'échéance");
  return echeance && echeance < auj ? 'en_retard' : 'en_attente';
}

/**
 * Niveau suggéré : le plus élevé entre ce que dicte le retard et le cran
 * suivant celui déjà envoyé. Après une relance 2, on propose la 3 même si le
 * retard ne l'imposerait pas encore — on ne renvoie pas deux fois le même
 * niveau. Plafonné à 3, le dernier cran avant recouvrement.
 */
export function niveauRelanceConseille(joursRetard, dernierNiveauEnvoye = 0) {
  let parRetard = 0;
  for (const [seuil, niveau] of SEUILS_RELANCE) {
    if (joursRetard >= seuil) { parRetard = niveau; break; }
  }
  const suivant = dernierNiveauEnvoye ? dernierNiveauEnvoye + 1 : 0;
  const n = Math.max(parRetard, suivant);
  return n === 0 ? null : Math.min(n, 3);
}

/** « Relance 2 » → 2. */
const numeroNiveau = (libelle) => Number(String(libelle || '').match(/(\d)/)?.[1]) || 0;

// ── Détail figé ───────────────────────────────────────────────────────
// Stocké en texte lisible dans Airtable, mais dans un format que les exports
// savent relire pour reconstruire la facture à l'identique.
const SEP = ' | ';

/**
 * Une ligne par jour : date | prestation | intervenants | heures | tarif |
 * montant | pointages d'origine. Lisible dans Airtable et relisible par les
 * exports, qui doivent reproduire la facture à l'identique.
 */
const encoderDetail = (lignes) => lignes.map((l) => [
  l.date || '—',
  l.prestation,
  `x${l.intervenants}`,
  l.heures == null ? '—' : `${l.heures} h`,
  l.tarif == null ? '—' : `${l.tarif} €/h`,
  `${l.montant} €`,
  (l.pointages || []).map((p) => `#${p.numero}`).join(' '),
].join(SEP)).join('\n');

const sansObjet = (v) => String(v ?? '').trim() === '—';

const nombre = (v) => Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;

export function decoderDetail(texte) {
  return String(texte || '').split('\n').map((ligne) => {
    const p = ligne.split(SEP).map((x) => x.trim());
    // Format enrichi, reconnu au marqueur « xN » de la 3e colonne. Se fier à la
    // date en tête ne marchait pas : un avoir sur une facture d'ancien format
    // ré-encode une date nulle en colonne VIDE, la ligne retombait alors dans la
    // branche héritée et toutes les colonnes se décalaient d'un cran — le client
    // recevait un avoir dont les lignes ne sommaient pas à son propre total.
    if (p.length >= 6 && /^x\d+$/.test(p[2])) {
      return {
        date: /^\d{4}-\d{2}-\d{2}$/.test(p[0]) ? p[0] : null,
        prestation: p[1],
        intervenants: Math.max(Math.round(nombre(p[2])), 1),
        // « — » veut dire « sans objet », pas zéro : une ligne au forfait n'a
        // ni heures ni taux, et le document doit laisser ces cases VIDES.
        // Les décoder en 0 imprimerait « 0,00 » à côté d'un montant de 540 €.
        heures: sansObjet(p[3]) ? null : nombre(p[3]),
        tarif: sansObjet(p[4]) ? null : nombre(p[4]),
        montant: nombre(p[5]),
        references: (p[6] || '').split(/\s+/).filter(Boolean),
      };
    }
    // Ancien format (5 colonnes, agrégé par prestation) : conservé pour les
    // factures émises avant le passage au détail journalier.
    if (p.length >= 5) {
      return {
        date: null,
        prestation: p[0],
        intervenants: 1,
        interventions: Math.round(nombre(p[1])),
        heures: nombre(p[2]),
        tarif: nombre(p[3]),
        montant: nombre(p[4]),
        references: [],
      };
    }
    return null;
  }).filter(Boolean);
}

// ── Agrégation des pointages non encore facturés ──────────────────────
/**
 * Lignes de facture à partir d'une liste de pointages : une par jour et par
 * prestation, les heures des intervenants simultanés cumulées.
 */
export function lignesParJour(pointages) {
  const parJour = new Map();
  for (const p of pointages) {
    if (!p.date) continue;
    const cle = `${p.date}|${p.prestation}`;
    if (!parJour.has(cle)) {
      parJour.set(cle, {
        date: p.date, prestation: p.prestation, heures: 0, pauseMinutes: 0,
        salaries: new Set(), pointages: [], tarif: p.tarifFacturation,
      });
    }
    const l = parJour.get(cle);
    l.heures += p.duree;
    l.pauseMinutes += p.pauseMinutes || 0;
    if (p.salarieId) l.salaries.add(p.salarieId);
    l.pointages.push({ id: p.id, numero: p.numero, salarie: p.salarie });
  }
  return [...parJour.values()]
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      || String(a.prestation || '').localeCompare(String(b.prestation || '')))
    .map((l) => ({
      date: l.date,
      prestation: l.prestation,
      intervenants: Math.max(l.salaries.size, 1),
      interventions: l.pointages.length,
      heures: arrondi(l.heures),
      pauseMinutes: l.pauseMinutes || 0,
      tarif: l.tarif,
      montant: l.tarif == null ? null : arrondi(l.heures * l.tarif),
      pointages: l.pointages,
      references: l.pointages.map((p) => `#${p.numero}`),
    }));
}

/**
 * Complète les factures dont le détail figé ne porte pas de dates — celles
 * émises avant le passage au détail journalier — en le reconstruisant depuis
 * leurs pointages liés. Les lignes ne sont remplacées que si leur somme
 * retombe au centime sur le total figé : une facture émise ne change pas de
 * montant parce qu'un pointage a bougé depuis.
 */
export async function completerLignesAnciennes(lues, enregistrements) {
  const aCompleter = lues.filter((f) => f.lignes?.length && f.lignes.every((l) => !l.date));
  if (!aCompleter.length) return;

  const sources = new Map(enregistrements.map((r) => [r.id, F(r, 'Pointages sources') || []]));
  const ids = [...new Set(aCompleter.flatMap((f) => sources.get(f.id) || []))];
  if (!ids.length) return;

  const refs = await referentiels();
  const bruts = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100);
    bruts.push(...await lister(T.POINTAGES, {
      formule: `OR(${lot.map((x) => `RECORD_ID()='${x}'`).join(',')})`,
    }));
  }
  const index = new Map(bruts.map((p) => [p.id, lirePointage(p, refs)]));

  for (const f of aCompleter) {
    const pts = (sources.get(f.id) || []).map((i) => index.get(i)).filter((p) => p && p.duree);
    const lignes = lignesParJour(pts);
    if (!lignes.length) continue;
    const total = arrondi(lignes.reduce((s, l) => s + (l.montant || 0), 0));
    if (Math.abs(total - (f.totalHT || 0)) < 0.01) {
      f.lignes = lignes;
      f.detailReconstruit = true;
    }
  }
}

/**
 * Regroupe les pointages terminés par hôtel ET par mois, au tarif de la
 * catégorie de l'hôtel. La clé porte le mois : sur une vue annuelle ou
 * globale, deux mois du même hôtel restent deux factures distinctes.
 */
/**
 * Un pointage n'est facturable que s'il désigne un hôtel exploitable. Deux cas
 * le disqualifient : aucun hôtel rattaché, ou un hôtel dont la fiche n'a pas de
 * nom — une ligne vide créée par erreur dans Airtable. Dans les deux cas le
 * pointage est écarté ET signalé : une prestation réalisée qui n'apparaît nulle
 * part est une prestation qu'on oublie de facturer.
 */
function hotelInexploitable(p, refs) {
  if (!p.hotelId) return 'aucun hôtel rattaché';
  const hotel = refs.iHotels[p.hotelId];
  if (!hotel) return 'hôtel supprimé de la base';
  if (!F(hotel, 'Nom')) return 'fiche hôtel sans nom';
  // Test POSITIF : seuls les deux modes reconnus écartent des heures. Une valeur
  // inattendue laisse le client en facturation horaire, donc visible.
  const mode = modeFacturation(hotel);
  if (mode === MODE_RECURRENT) return 'client au forfait — heures réalisées, non refacturées';
  if (mode === MODE_LIBRE) return 'client en facturation libre — heures réalisées, non refacturées';
  return null;
}

// ── Mode récurrent ────────────────────────────────────────────────────
const PAS_FREQUENCE = { 'Mensuelle': 1, 'Trimestrielle': 3, 'Semestrielle': 6, 'Annuelle': 12 };

const indexMois = (mois) => { const [a, m] = String(mois).split('-').map(Number); return a * 12 + (m - 1); };
const premierJour = (mois) => `${mois}-01`;

/** Mois couverts par la période affichée. Sans cela, les vues « année » et
 *  « tout » n'auraient aucun mois de référence et feraient tomber la route. */
function moisDeLaPeriode(filtre, refs) {
  if (filtre.periode === 'mois' && filtre.mois) return [filtre.mois];
  const auj = aujourdhuiParis().slice(0, 7);
  if (filtre.periode === 'annee' && filtre.annee) {
    const mois = [];
    for (let m = 1; m <= 12; m += 1) {
      const cle = `${filtre.annee}-${String(m).padStart(2, '0')}`;
      if (cle <= auj) mois.push(cle);       // on ne facture pas l'avenir
    }
    return mois;
  }
  // « Tout l'historique » : les douze derniers mois, au-delà il n'y a rien à
  // proposer — les contrats plus anciens ont déjà été facturés ou ne l'ont
  // jamais été, et fabriquer des cibles sur cinq ans noierait l'écran.
  const mois = [];
  for (let i = 11; i >= 0; i -= 1) mois.push(moisDecale(auj, -i));
  return mois;
}

/**
 * Le contrat couvre-t-il ce mois ? Une date de fin VIDE signifie durée
 * indéterminée : le contrat court tant qu'il est actif, c'est le cas le plus
 * courant et il ne doit surtout pas se lire comme « terminé ».
 */
function contratCouvre(contrat, mois) {
  const debut = F(contrat, 'Date de début');
  if (!debut) return false;                        // sans début, aucune échéance calculable
  if (debut > finDeMois(mois)) return false;
  const fin = F(contrat, 'Date de fin');
  return !fin || fin >= premierJour(mois);
}

/** L'échéance tombe-t-elle sur ce mois ? Ancrée sur la date de début. */
function echeanceTombeSur(contrat, mois) {
  const pas = PAS_FREQUENCE[nomOption(F(contrat, 'Fréquence'))];
  if (!pas) return false;                          // fréquence inconnue : jamais « par défaut »
  const debut = F(contrat, 'Date de début');
  const ecart = indexMois(mois) - indexMois(debut.slice(0, 7));
  return ecart >= 0 && ecart % pas === 0;
}

/** Motif qui empêche de facturer ce contrat, ou null. */
function contratBloquant(contrat) {
  if (!F(contrat, 'Date de début')) return 'contrat sans date de début';
  const freq = nomOption(F(contrat, 'Fréquence'));
  if (!freq) return 'fréquence non renseignée sur le contrat';
  if (!PAS_FREQUENCE[freq]) return `fréquence « ${freq} » inconnue`;
  const montant = F(contrat, 'Montant HT');
  if (!Number.isFinite(montant) || montant <= 0) return 'contrat sans montant HT';
  if (!F(contrat, 'Libellé')) return 'contrat sans libellé';
  return null;
}

/**
 * Un groupe PAR CLIENT au forfait et par mois — jamais un groupe par contrat.
 * Un client dont le contrat manque, dort ou n'échoit pas ce mois-ci doit rester
 * VISIBLE au cockpit avec son motif : un mois de chiffre d'affaires qui
 * disparaît sans un message est le pire des défauts possibles ici.
 */
async function groupesRecurrents(filtre, refs) {
  // Côté CLIENT en revanche, « Actif » décoché veut dire « plus au contrat » :
  // les 20 fiches l'ont coché, et un client sans la case ne doit pas disparaître.
  const clients = refs.hotels.filter((c) => estRecurrent(c) && F(c, 'Actif') !== false);
  if (!clients.length) return [];

  const contrats = await lister(T.CONTRATS);
  const parClient = new Map();
  for (const c of contrats) {
    const id = lien(c, 'Client');
    if (!id) continue;
    if (!parClient.has(id)) parClient.set(id, []);
    parClient.get(id).push(c);
  }

  const groupes = [];
  for (const mois of moisDeLaPeriode(filtre, refs)) {
    for (const client of clients) {
      const siens = parClient.get(client.id) || [];
      // Airtable n'envoie PAS les cases décochées : F() rend null, et « !== false »
      // laissait passer un contrat désactivé. On exige la case cochée.
      const actifs = siens.filter((c) => Boolean(F(c, 'Actif')));
      const malFormes = actifs.map(contratBloquant).filter(Boolean);
      const sains = actifs.filter((c) => !contratBloquant(c));
      const couvrants = sains.filter((c) => contratCouvre(c, mois));
      const echus = couvrants.filter((c) => echeanceTombeSur(c, mois));

      // Le contrat n'a pas encore commencé : le client n'est pas client sur ce
      // mois-là. Le signaler serait crier au loup sur tous les mois antérieurs.
      const debuts = sains.map((c) => F(c, 'Date de début')).filter(Boolean);
      if (siens.length && !malFormes.length && debuts.length
        && debuts.every((d) => d > finDeMois(mois))) continue;

      // Contrat sain qui n'échoit simplement pas ce mois-ci : c'est le
      // fonctionnement normal d'un annuel ou d'un trimestriel, pas une anomalie.
      if (!echus.length && !malFormes.length && couvrants.length) continue;

      let bloquant = null;
      if (!siens.length) bloquant = 'aucun contrat sur ce client';
      else if (malFormes.length) bloquant = malFormes[0];
      else if (!couvrants.length) bloquant = 'aucun contrat actif sur ce mois';

      const lignes = echus.map((c) => ({
        date: finDeMois(mois),
        prestation: F(c, 'Libellé'),
        intervenants: 1,
        heures: null,
        tarif: null,
        montant: F(c, 'Montant HT'),
        pointages: [],
      }));

      groupes.push({
        cle: `${client.id}|${mois}`,
        mois,
        hotelId: client.id,
        hotel: F(client, 'Nom'),
        categorie: nomOption(F(client, 'Catégorie')),
        lignes,
        pointageIds: [],
        contratIds: echus.map((c) => c.id),
        origine: MODE_RECURRENT,
        bloquant,
        tarifManquant: false,
        totalHT: bloquant ? null : arrondi(lignes.reduce((s, l) => s + l.montant, 0)),
      });
    }
  }
  return groupes;
}

/** Tous les groupes facturables de la période, quel que soit le mode. */
async function groupesDuMois(filtre, refs) {
  const { groupes, aRegulariser } = await grouperPointages(filtre, refs);
  for (const g of await groupesRecurrents(filtre, refs)) groupes.set(g.cle, g);
  return { groupes, aRegulariser };
}

async function grouperPointages(filtre, refs) {
  const bruts = await lister(T.POINTAGES, {
    formule: formulePeriode("Heure d'arrivée", filtre),
  });
  const retenus = bruts.map((p) => lirePointage(p, refs))
    .filter((p) => p.statut === 'Terminée' && p.duree && p.date);

  const aRegulariser = [];
  const pointages = [];
  for (const p of retenus) {
    const raison = hotelInexploitable(p, refs);
    if (raison) {
      aRegulariser.push({
        id: p.id, numero: p.numero, date: p.date, salarie: p.salarie,
        prestation: p.prestation, duree: p.duree, raison,
      });
    } else pointages.push(p);
  }

  const parHotel = new Map();
  for (const p of pointages) {
    const mois = p.date.slice(0, 7);
    const cle = `${p.hotelId}|${mois}`;
    if (!parHotel.has(cle)) {
      parHotel.set(cle, {
        cle, mois, hotelId: p.hotelId, hotel: p.hotel, categorie: p.categorieHotel,
        pointages: [], pointageIds: [],
      });
    }
    const g = parHotel.get(cle);
    g.pointageIds.push(p.id);
    g.pointages.push(p);
  }

  for (const g of parHotel.values()) {
    // La pause du client se retranche avant tout calcul de ligne.
    const pause = F(refs.iHotels[g.hotelId], 'Pause déduite (minutes)') || 0;
    g.pauseMinutes = pause;
    g.lignes = lignesParJour(appliquerPause(g.pointages, pause));
    // Un tarif absent n'est pas un tarif à zéro : on refuse de facturer.
    g.tarifManquant = g.lignes.some((l) => l.tarif == null);
    g.totalHT = g.tarifManquant ? null : arrondi(g.lignes.reduce((s, l) => s + l.montant, 0));
    delete g.pointages;
  }
  aRegulariser.sort((x, y) => String(x.date).localeCompare(String(y.date)));
  return { groupes: parHotel, aRegulariser };
}

// ── Numérotation ──────────────────────────────────────────────────────
// Format F<AA>-<NNN>, remis à 001 chaque année. Séquentiel et sans trou :
// la génération en série incrémente un compteur lu une seule fois, et crée
// les factures les unes après les autres — jamais en parallèle.
function anneeSurDeux(iso) { return iso.slice(2, 4); }

// Un avoir a sa propre série : A26-001, A26-002… Mélanger les deux dans la
// même suite rendrait illisible le rapprochement facture / avoir, et une série
// distincte mais continue est ce que la comptabilité attend.
export const PREFIXE_FACTURE = 'F';
export const PREFIXE_AVOIR = 'A';

/**
 * Le champ « Numéro » d'Airtable ne porte QUE le rang : 1, 2, 3. La référence
 * imprimée — F26-001, A26-001 — se construit à la lecture, à partir de trois
 * éléments : la série (facture ou avoir, lue dans le Statut), l'année de la
 * date d'émission, et ce rang. Stocker la référence entière obligeait à la
 * réécrire dès qu'un document changeait de nature ; la construire la rend
 * toujours cohérente avec ce que la fiche dit.
 */
const rangDe = (rec) => {
  const v = F(rec, 'Numéro');
  if (v == null || v === '') return null;
  // Un numéro de ligne arrive en nombre ; les anciennes valeurs « F26-001 »
  // comme « 1 » arrivent en texte et se laissent lire de la même façon.
  const m = String(v).match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
};

const serieDe = (rec) => (nomOption(F(rec, 'Statut')) === 'Avoir' ? PREFIXE_AVOIR : PREFIXE_FACTURE);

const anneeDe = (rec) => {
  const d = F(rec, "Date d'émission") || F(rec, 'Mois facturé');
  return d ? String(d).slice(2, 4) : aujourdhuiParis().slice(2, 4);
};

const composerReference = (serie, annee2, rang) =>
  `${serie}${annee2}-${String(rang).padStart(3, '0')}`;

/** Référence imprimée sur le document : F26-001, A26-001. */
export function referenceFacture(rec) {
  const rang = rangDe(rec);
  return rang == null ? '' : composerReference(serieDe(rec), anneeDe(rec), rang);
}

/**
 * Rangs déjà pris, toutes séries confondues. Ne sert plus qu'au repli : quand
 * « Numéro » est un numéro de ligne géré par Airtable, c'est lui qui numérote.
 */
async function rangsPris() {
  const toutes = await lister(T.FACTURES, { champs: ['Numéro'] });
  const pris = new Set();
  for (const f of toutes) {
    const rang = rangDe(f);
    if (rang != null) pris.add(rang);
  }
  return pris;
}

/**
 * Rang d'une pièce qui vient d'être créée. Airtable le renvoie déjà si
 * « Numéro » est un champ « numéro automatique » : c'est le cas nominal, et il
 * ne peut pas entrer en collision, même après une suppression.
 * Le repli ne sert qu'au cas où le champ n'a pas encore été converti — il ne
 * faut pas qu'une facture sorte sans référence entre deux réglages.
 */
async function rangApresCreation(cree) {
  const direct = rangDe(cree);
  if (direct != null) return { rang: direct, aEcrire: false };

  // Une relecture : un champ « numéro automatique » n'est pas toujours renvoyé
  // dans la réponse de création, mais il est là dès qu'on relit la fiche.
  const [relu] = await lister(T.FACTURES, { formule: `RECORD_ID() = '${cree.id}'` });
  const apres = relu ? rangDe(relu) : null;
  if (apres != null) return { rang: apres, aEcrire: false };

  const pris = await rangsPris();
  let curseur = pris.size ? Math.max(...pris) : 0;
  do { curseur += 1; } while (pris.has(curseur));
  return { rang: curseur, aEcrire: true };
}

/**
 * Inscrit le rang quand Airtable ne le gère pas lui-même. Le champ « Numéro »
 * est un texte : lui passer un nombre le fait refuser par « Field "Numéro"
 * cannot accept the provided value ». Et s'il devient un numéro automatique, il
 * passe en lecture seule — l'écriture doit alors échouer SANS emporter la
 * requête, la pièce étant déjà créée.
 */
async function inscrireRang(id, rang) {
  try {
    await modifier(T.FACTURES, id, { 'Numéro': String(rang) });
  } catch (e) {
    console.warn(`Rang non inscrit sur ${id} (champ Numéro en lecture seule ?) :`, e.message);
  }
}

/**
 * Réserve les numéros d'une série. Un numéro déjà porté par une facture n'est
 * jamais réattribué : deux documents sous la même référence, c'est une facture
 * introuvable pour le client et une écriture en double pour le comptable.
 * On relit la liste des numéros pris juste avant d'écrire, ce qui referme la
 * fenêtre du double clic — Airtable n'ayant pas de transaction, c'est le
 * garde-fou le plus serré qu'on puisse poser côté application.
 *
 * LIMITE CONNUE, à dire plutôt qu'à taire : le compteur se déduit des factures
 * PRÉSENTES. Supprimer un enregistrement dans Airtable libère son numéro, qui
 * sera repris. Le fermer pour de bon demande un compteur persistant — une
 * petite table à deux colonnes — que la gérante doit valider avant création.
 */


// ── Lecture ───────────────────────────────────────────────────────────
function lireFacture(rec, refs, auj, relancesParFacture) {
  const hotelId = lien(rec, CHAMP_CLIENT);
  const hotel = refs.iHotels[hotelId];
  const statut = statutFacture(rec, auj);
  const echeance = F(rec, "Date d'échéance");
  const joursRetard = statut === 'en_retard' && echeance ? ecartJours(echeance, auj) : null;
  const totalHT = F(rec, 'Total HT') || 0;
  const tauxTVA = F(rec, 'Taux TVA') ?? TVA_DEFAUT;
  const totalTVA = arrondi(totalHT * tauxTVA);
  const relances = relancesParFacture?.get(rec.id) || [];
  const envoyees = relances.filter((r) => r.statut === 'Envoyée');
  const dernierNiveauEnvoye = envoyees.reduce((m, r) => Math.max(m, r.niveauNum), 0);

  return {
    id: rec.id,
    numero: referenceFacture(rec),
    rang: rangDe(rec),
    hotelId,
    hotel: hotel ? F(hotel, 'Nom') : '—',
    adresse: hotel ? F(hotel, 'Adresse') || '' : '',
    categorie: hotel ? nomOption(F(hotel, 'Catégorie')) : null,
    emailFacturation: hotel ? F(hotel, 'Contact facturation') || '' : '',
    codeClient: hotel ? F(hotel, 'Code client') || '' : '',
    mois: (F(rec, 'Mois facturé') || '').slice(0, 7),
    statut,
    totalHT, tauxTVA, totalTVA, totalTTC: arrondi(totalHT + totalTVA),
    dateEmission: F(rec, "Date d'émission") || null,
    dateEnvoi: F(rec, "Date d'envoi") || null,
    dateEcheance: echeance || null,
    datePaiement: F(rec, 'Date de paiement') || null,
    montantRegle: F(rec, 'Montant réglé') ?? null,
    modeReglement: nomOption(F(rec, 'Mode de règlement')),
    referencePaiement: F(rec, 'Référence paiement') || '',
    joursRetard,
    niveauConseille: joursRetard == null ? null : niveauRelanceConseille(joursRetard, dernierNiveauEnvoye),
    dernierNiveauEnvoye,
    nbRelances: relances.length,
    derniereRelance: relances[0] || null,
    // Historique complet, pour l'afficher sans second appel.
    relances,
    lignes: decoderDetail(F(rec, 'Détail des prestations')),
    tarifManquant: false,
  };
}

/** Ligne synthétique pour un hôtel dont la facture du mois n'existe pas encore. */
function ligneAFacturer(groupe, refs) {
  const mois = groupe.mois;
  const hotel = refs.iHotels[groupe.hotelId];
  const totalHT = groupe.totalHT || 0;
  const totalTVA = arrondi(totalHT * TVA_DEFAUT);
  return {
    id: null, numero: null,
    hotelId: groupe.hotelId, hotel: groupe.hotel,
    adresse: hotel ? F(hotel, 'Adresse') || '' : '',
    categorie: groupe.categorie,
    emailFacturation: hotel ? F(hotel, 'Contact facturation') || '' : '',
    codeClient: hotel ? F(hotel, 'Code client') || '' : '',
    mois, statut: 'a_facturer',
    origine: groupe.origine || MODE_HORAIRE,
    // Motif lisible qui empêche d'émettre : tarif absent, contrat manquant,
    // fréquence douteuse. Tant qu'il est là, la ligne se voit mais ne se génère pas.
    bloquant: groupe.bloquant || (groupe.tarifManquant
      ? (groupe.categorie ? 'tarif manquant pour cette catégorie' : 'hôtel sans catégorie')
      : null),
    totalHT, tauxTVA: TVA_DEFAUT, totalTVA, totalTTC: arrondi(totalHT + totalTVA),
    dateEmission: null, dateEnvoi: null, dateEcheance: null, datePaiement: null,
    montantRegle: null, modeReglement: null, referencePaiement: '',
    joursRetard: null, niveauConseille: null, dernierNiveauEnvoye: 0,
    nbRelances: 0, derniereRelance: null, relances: [],
    lignes: groupe.lignes,
    tarifManquant: groupe.tarifManquant,
    nbPointages: groupe.pointageIds.length,
  };
}

async function indexerRelances(factureIds) {
  if (!factureIds.length) return new Map();
  const toutes = await lister(T.RELANCES, { tri: [{ field: "Date d'envoi", direction: 'desc' }] });
  const index = new Map();
  for (const r of toutes) {
    const fid = lien(r, 'Facture');
    if (!fid || !factureIds.includes(fid)) continue;
    if (!index.has(fid)) index.set(fid, []);
    index.get(fid).push({
      id: r.id,
      niveau: nomOption(F(r, 'Niveau')),
      niveauNum: numeroNiveau(nomOption(F(r, 'Niveau'))),
      date: F(r, "Date d'envoi") || null,
      destinataire: F(r, 'Destinataire') || '',
      objet: F(r, 'Objet') || '',
      statut: nomOption(F(r, 'Statut')),
    });
  }
  // Le tri Airtable ne départage pas deux relances du même jour : on
  // retrie ici par date puis par niveau, pour que « la dernière » le soit.
  for (const lot of index.values()) {
    lot.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.niveauNum - a.niveauNum);
  }
  return index;
}

async function listerPeriode(filtre, hotelId) {
  const auj = aujourdhuiParis();
  const refs = await referentiels();
  const enregistrees = await lister(T.FACTURES, {
    formule: formulePeriode('Mois facturé', filtre),
  });
  const relances = await indexerRelances(enregistrees.map((f) => f.id));
  // La clé est le couple hôtel + mois : un même hôtel peut avoir une facture
  // par mois, et l'affichage « tout » les montre côte à côte.
  const deja = new Set(enregistrees.map((f) => `${lien(f, CHAMP_CLIENT)}|${(F(f, 'Mois facturé') || '').slice(0, 7)}`));

  const { groupes, aRegulariser } = await groupesDuMois(filtre, refs);
  const lues = enregistrees.map((f) => lireFacture(f, refs, auj, relances));
  // Un seul appel supplémentaire, quel que soit le nombre de factures à compléter.
  await completerLignesAnciennes(lues, enregistrees);
  let lignes = [
    ...lues,
    ...[...groupes.values()].filter((g) => !deja.has(g.cle)).map((g) => ligneAFacturer(g, refs)),
  ];
  if (hotelId) lignes = lignes.filter((l) => l.hotelId === hotelId);
  // Le mois d'abord, du plus récent au plus ancien, puis l'hôtel.
  lignes.sort((a, b) => String(b.mois || '').localeCompare(String(a.mois || ''))
    || String(a.hotel || '').localeCompare(String(b.hotel || '')));

  const cumul = (f) => {
    const lot = lignes.filter(f);
    return { nombre: lot.length, montant: arrondi(lot.reduce((s, l) => s + (l.totalHT || 0), 0)) };
  };
  const emises = lignes.filter((l) => l.id && l.statut !== 'annulee');
  return {
    ...filtre,
    lignes,
    indicateurs: {
      aFacturer: cumul((l) => l.statut === 'a_facturer'),
      envoyees: cumul((l) => Boolean(l.dateEnvoi)),
      enAttente: cumul((l) => l.statut === 'en_attente'),
      enRetard: cumul((l) => l.statut === 'en_retard'),
    },
    // Total réellement facturé sur la période affichée, annulations exclues.
    totalFacture: {
      nombre: emises.length,
      ht: arrondi(emises.reduce((s, l) => s + (l.totalHT || 0), 0)),
      ttc: arrondi(emises.reduce((s, l) => s + (l.totalTTC || 0), 0)),
      encaisse: arrondi(emises.filter((l) => l.statut === 'payee')
        .reduce((s, l) => s + (l.montantRegle ?? l.totalTTC ?? 0), 0)),
    },
    moisPresents: [...new Set(lignes.map((l) => l.mois).filter(Boolean))].sort().reverse(),
    tarifManquant: lignes.some((l) => l.tarifManquant),
    aRegulariser,
  };
}

/**
 * Pointages ayant produit une facture, pour remonter à la source depuis la
 * fiche : qui est intervenu, quel jour, de quelle heure à quelle heure.
 * Les montants, eux, restent ceux figés dans la facture — ce détail est une
 * pièce justificative, pas une base de recalcul.
 */
async function detailFacture(id) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
    const e = new Error('Identifiant de facture invalide.'); e.status = 400; throw e;
  }
  const [rec] = await lister(T.FACTURES, { formule: `RECORD_ID() = '${id}'` });
  if (!rec) { const e = new Error('Facture introuvable.'); e.status = 404; throw e; }

  const ids = F(rec, 'Pointages sources') || [];
  if (!ids.length) return { pointages: [] };

  const refs = await referentiels();
  const bruts = await lister(T.POINTAGES, {
    formule: `OR(${ids.map((i) => `RECORD_ID()='${i}'`).join(',')})`,
  });
  const pointages = bruts.map((p) => lirePointage(p, refs)).map((p) => ({
    id: p.id,
    numero: p.numero,
    date: p.date,
    prestation: p.prestation,
    salarie: p.salarie,
    arrivee: p.arrivee,
    depart: p.depart,
    duree: p.duree,
    statut: p.statut,
    observation: p.observation,
  })).sort((a, b) => String(a.date).localeCompare(String(b.date))
    || String(a.prestation).localeCompare(String(b.prestation))
    || String(a.salarie).localeCompare(String(b.salarie)));

  return { pointages };
}

// ── Génération ────────────────────────────────────────────────────────
async function genererMois(mois, hotelId) {
  const refs = await referentiels();
  const filtre = { periode: 'mois', mois };
  const enregistrees = await lister(T.FACTURES, { formule: formulePeriode('Mois facturé', filtre) });
  const deja = new Set(enregistrees.map((f) => lien(f, CHAMP_CLIENT)));

  const { groupes } = await groupesDuMois(filtre, refs);
  let cibles = [...groupes.values()].filter((g) => !deja.has(g.hotelId));
  if (hotelId) cibles = cibles.filter((g) => g.hotelId === hotelId);
  cibles.sort((a, b) => String(a.hotel || '').localeCompare(String(b.hotel || '')));

  const emission = finDeMois(mois);
  const creees = [];
  const ignorees = [];

  const motif = (g) => g.bloquant || (g.tarifManquant
    ? (g.categorie ? 'tarif manquant pour cette catégorie' : 'hôtel sans catégorie')
    : null);
  const aEmettre = cibles.filter((g) => !motif(g));
  for (const g of cibles.filter((g) => motif(g))) ignorees.push({ hotel: g.hotel, raison: motif(g) });

  for (const [i, g] of aEmettre.entries()) {
    // Relecture juste avant d'écrire. La liste des déjà-facturés a été prise au
    // début : entre-temps un second clic — ou un second onglet — a pu créer la
    // facture. Airtable n'ayant pas de transaction, c'est le verrou le plus
    // serré possible ici ; le définitif serait une contrainte d'unicité sur
    // (Client, Mois facturé) posée dans la base.
    const dejaMaintenant = new Set((await lister(T.FACTURES, {
      formule: formulePeriode('Mois facturé', filtre),
    })).map((f2) => lien(f2, CHAMP_CLIENT)));
    if (dejaMaintenant.has(g.hotelId)) {
      ignorees.push({ hotel: g.hotel, raison: 'déjà facturé sur ce mois' });
      continue;
    }

    const hotel = refs.iHotels[g.hotelId];
    const delai = F(hotel, 'Délai de paiement (jours)') || DELAI_DEFAUT;

    const cree = await creer(T.FACTURES, {
      [CHAMP_CLIENT]: [g.hotelId],
      'Mois facturé': moisDeLaFacture(mois),
      'Statut': 'Brouillon',
      'Total HT': g.totalHT,
      'Taux TVA': TVA_DEFAUT,
      "Date d'émission": emission,
      "Date d'échéance": ajouterJours(emission, delai),
      'Détail des prestations': encoderDetail(g.lignes),
      'Pointages sources': g.pointageIds.slice(0, 100),
      // Trace d'origine du montant : l'équivalent des pointages, côté forfait.
      ...(g.contratIds?.length ? { 'Contrat récurrent': g.contratIds } : {}),
    });
    // Airtable vient d'attribuer le numéro de ligne : la référence s'en déduit.
    const { rang, aEcrire } = await rangApresCreation(cree);
    if (aEcrire) await inscrireRang(cree.id, rang);
    creees.push({
      numero: composerReference(PREFIXE_FACTURE, anneeSurDeux(emission), rang),
      hotel: g.hotel, totalHT: g.totalHT,
    });
  }
  return { creees, ignorees, dejaFacturees: cibles.length === 0 && deja.size > 0 ? deja.size : 0 };
}

// ── Actions sur une facture ───────────────────────────────────────────
async function appliquerAction(corps) {
  const { id, action } = corps;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id || '')) { const e = new Error('Identifiant invalide.'); e.status = 400; throw e; }

  if (action === 'envoyer') {
    const [rec] = await lister(T.FACTURES, { formule: `RECORD_ID() = '${id}'` });
    const echeance = rec ? F(rec, "Date d'échéance") : null;
    const envoi = corps.date || aujourdhuiParis();
    await modifier(T.FACTURES, id, {
      "Date d'envoi": envoi,
      'Statut': echeance && echeance < envoi ? 'Retard' : 'Envoyée',
    });
    return { ok: true };
  }
  if (action === 'payer') {
    const champs = {
      'Date de paiement': corps.datePaiement || aujourdhuiParis(),
      'Statut': 'Payée',
    };
    if (corps.montant != null && corps.montant !== '') champs['Montant réglé'] = Number(corps.montant);
    if (corps.mode) champs['Mode de règlement'] = corps.mode;
    if (corps.reference) champs['Référence paiement'] = String(corps.reference).trim();
    await modifier(T.FACTURES, id, champs);
    return { ok: true };
  }
  // Paiement saisi par erreur : on efface le règlement et la facture repart
  // en attente. Le statut réel (attente ou retard) est recalculé à la lecture.
  if (action === 'annuler-paiement') {
    // La facture redevient impayée : si son échéance est déjà passée, elle est
    // en retard, pas simplement « envoyée ».
    const [rec] = await lister(T.FACTURES, { formule: `RECORD_ID() = '${id}'` });
    const echeance = rec ? F(rec, "Date d'échéance") : null;
    await modifier(T.FACTURES, id, {
      'Date de paiement': null,
      'Montant réglé': null,
      'Mode de règlement': null,
      'Référence paiement': '',
      'Statut': echeance && echeance < aujourdhuiParis() ? 'Retard' : 'Envoyée',
    });
    return { ok: true };
  }
  if (action === 'annuler') { await modifier(T.FACTURES, id, { 'Statut': 'Annulée' }); return { ok: true }; }
  if (action === 'avoir') return emettreAvoir(id);

  const e = new Error('Action inconnue.'); e.status = 400; throw e;
}

/**
 * Crée une pièce à la main — facture ou avoir — depuis l'éditeur.
 *
 * Trois champs sont imposés parce que les omettre rend la pièce inexploitable,
 * et qu'aucun message ne le dirait :
 *  — « Mois facturé » : les trois requêtes du cockpit filtrent dessus. Sans lui,
 *    la facture existe dans Airtable et n'apparaît NULLE PART, pas même dans
 *    l'export du comptable.
 *  — « Date d'échéance » : sans elle, statutFacture ne peut jamais rendre
 *    « en retard ». La facture sort définitivement du circuit de relance.
 *  — une date sur CHAQUE ligne : une ligne sans date retombe dans la
 *    reconstruction des anciennes factures et peut se faire réécrire.
 */
async function creerPiece(corps) {
  const refus = (msg, code = 400) => { const e = new Error(msg); e.status = code; throw e; };
  const { type, client, mois, dateEmission, tauxTVA, lignes } = corps;

  if (type !== 'facture' && type !== 'avoir') refus('Type de document inconnu.');
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(client || ''))) refus('Client invalide.');
  if (!/^\d{4}-\d{2}$/.test(String(mois || ''))) refus('Mois requis (AAAA-MM).');

  const refs = await referentiels();
  const fiche = refs.iHotels[client];
  if (!fiche) refus('Client introuvable.');
  if (!F(fiche, 'Nom')) refus("Cette fiche client n'a pas de nom : complète-la dans Airtable.");

  if (!Array.isArray(lignes) || !lignes.length) refus('Ajoute au moins une ligne.');
  const propres = lignes.map((l, i) => {
    const rang = i + 1;
    // Pas de date sur une ligne saisie à la main : elle ne dirait rien de plus
    // que la date du document, et la description doit porter le seul titre de
    // la prestation. Sans date, la ligne ne risque pas la reconstruction des
    // anciennes factures : celle-ci ne s'applique qu'aux pièces ayant des
    // pointages sources, qu'une pièce libre n'a jamais.
    const libelle = String(l.prestation || '').trim();
    if (!libelle) refus(`Ligne ${rang} : description manquante.`);
    const montant = Number(l.montant);
    if (!Number.isFinite(montant) || montant <= 0) refus(`Ligne ${rang} : montant invalide.`);
    const heures = l.heures == null || l.heures === '' ? null : Number(l.heures);
    const tarif = l.tarif == null || l.tarif === '' ? null : Number(l.tarif);
    return {
      date: null,
      prestation: libelle,
      intervenants: 1,
      heures: Number.isFinite(heures) ? heures : null,
      tarif: Number.isFinite(tarif) ? tarif : null,
      montant: arrondi(montant),
      pointages: [],
    };
  });

  const totalSaisi = arrondi(propres.reduce((acc, l) => acc + l.montant, 0));
  if (totalSaisi <= 0) refus('Le total doit être supérieur à zéro.');

  const emission = /^\d{4}-\d{2}-\d{2}$/.test(String(dateEmission || ''))
    ? dateEmission : finDeMois(mois);
  const taux = Number.isFinite(Number(tauxTVA)) ? Number(tauxTVA) : TVA_DEFAUT;
  const estAvoir = type === 'avoir';

  // Un avoir porte des montants négatifs : c'est le signe, avec le statut, qui
  // fait imprimer AVOIR et « net à rembourser » au lieu d'une facture.
  const aEcrire = estAvoir
    ? propres.map((l) => ({ ...l, heures: l.heures == null ? null : -l.heures, montant: -l.montant }))
    : propres;

  const champs = {
    [CHAMP_CLIENT]: [client],
    'Mois facturé': moisDeLaFacture(mois),
    'Statut': estAvoir ? 'Avoir' : 'Brouillon',
    'Total HT': estAvoir ? -totalSaisi : totalSaisi,
    'Taux TVA': taux,
    "Date d'émission": emission,
    'Détail des prestations': encoderDetail(aEcrire),
  };
  // Un avoir ne s'échoit pas : c'est nous qui devons.
  if (!estAvoir) {
    champs["Date d'échéance"] = ajouterJours(emission, F(fiche, 'Délai de paiement (jours)') || DELAI_DEFAUT);
  }

  const cree = await creer(T.FACTURES, champs);
  const { rang, aEcrire: ecrireRang } = await rangApresCreation(cree);
  if (ecrireRang) await inscrireRang(cree.id, rang);

  const numero = composerReference(
    estAvoir ? PREFIXE_AVOIR : PREFIXE_FACTURE, anneeSurDeux(emission), rang,
  );
  return { ok: true, id: cree.id, numero, type, totalHT: champs['Total HT'] };
}

/**
 * Émet un AVOIR : une pièce nouvelle, avec son propre numéro et des montants
 * négatifs, qui annule comptablement une facture déjà partie chez le client.
 *
 * Ce n'est pas une étiquette posée sur la facture d'origine. Celle-ci a été
 * envoyée : le client en détient un exemplaire, elle doit rester telle quelle,
 * avec son numéro et son montant. Sans pièce de sens contraire, le récapitulatif
 * du comptable additionnerait la facture erronée ET sa remplaçante.
 */
async function emettreAvoir(id) {
  const refus = (msg, code = 409) => { const e = new Error(msg); e.status = code; throw e; };

  const [rec] = await lister(T.FACTURES, { formule: `RECORD_ID() = '${id}'` });
  if (!rec) refus('Facture introuvable.', 404);

  const numero = referenceFacture(rec);
  const statut = statutFacture(rec, aujourdhuiParis());
  if (statut === 'brouillon') refus("Cette facture n'est pas encore partie : corrige-la ou annule-la, un avoir n'a pas lieu d'être.");
  if (statut === 'annulee') refus('Cette facture est annulée.');
  if (statut === 'avoir') refus("Ceci est déjà un avoir.");

  const totalHT = F(rec, 'Total HT') || 0;
  if (totalHT <= 0) refus("Cette facture n'a pas de montant à créditer.");

  // Un second avoir sur la même facture créditerait le client deux fois.
  const existants = await lister(T.FACTURES, { formule: `{Référence document} = '${echapper(numero)}'` });
  if (existants.length) refus(`Un avoir existe déjà pour ${numero} (${referenceFacture(existants[0])}).`);

  const emission = aujourdhuiParis();

  // Les lignes sont reprises à l'identique, quantités et montants inversés :
  // le client doit pouvoir rapprocher l'avoir de sa facture ligne à ligne.
  const lignes = decoderDetail(F(rec, 'Détail des prestations')).map((l) => ({
    date: l.date,
    prestation: l.prestation,
    intervenants: l.intervenants,
    heures: l.heures == null ? null : -l.heures,
    tarif: l.tarif,
    montant: -(l.montant || 0),
    pointages: [],
  }));

  const cree = await creer(T.FACTURES, {
    [CHAMP_CLIENT]: lien(rec, CHAMP_CLIENT) ? [lien(rec, CHAMP_CLIENT)] : undefined,
    'Mois facturé': F(rec, 'Mois facturé'),
    'Statut': 'Avoir',
    'Total HT': -totalHT,
    'Taux TVA': F(rec, 'Taux TVA') ?? TVA_DEFAUT,
    "Date d'émission": emission,
    'Détail des prestations': lignes.length ? encoderDetail(lignes) : '',
    'Référence document': numero,
  });

  // Airtable a numéroté la ligne : la référence de l'avoir s'en déduit.
  const { rang, aEcrire } = await rangApresCreation(cree);
  if (aEcrire) await inscrireRang(cree.id, rang);
  const numeroAvoir = composerReference(PREFIXE_AVOIR, anneeSurDeux(emission), rang);

  // La facture d'origine n'est pas modifiée : on lui adjoint seulement la trace.
  const trace = `Avoir ${numeroAvoir} émis le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
  const commentaires = F(rec, 'Commentaires') || '';
  await modifier(T.FACTURES, id, { 'Commentaires': commentaires ? `${commentaires}\n${trace}` : trace });

  return { ok: true, numero: numeroAvoir, id: cree.id, montantHT: -totalHT };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const corps = req.body || {};
      // La présence de lignes distingue la création manuelle de la génération.
      if (Array.isArray(corps.lignes)) return res.json(await creerPiece(corps));
      const { mois, hotel } = corps;
      if (!/^\d{4}-\d{2}$/.test(mois || '')) return res.status(400).json({ error: 'Mois requis (AAAA-MM).' });
      return res.json(await genererMois(mois, hotel || null));
    }
    if (req.method === 'PATCH') return res.json(await appliquerAction(req.body || {}));
    if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

    // Détail d'une facture : les pointages qui l'ont produite.
    if (req.query.facture) return res.json(await detailFacture(req.query.facture));

    const { mois, annee, periode, hotel } = req.query;
    const p = periode === 'annee' || periode === 'tout' ? periode : 'mois';
    if (p === 'mois' && !/^\d{4}-\d{2}$/.test(mois || '')) {
      return res.status(400).json({ error: 'Mois requis (AAAA-MM).' });
    }
    if (p === 'annee' && !/^\d{4}$/.test(annee || '')) {
      return res.status(400).json({ error: 'Année requise (AAAA).' });
    }
    res.json(await listerPeriode({ periode: p, mois, annee }, hotel || null));
  } catch (err) { envoyerErreur(res, err); }
}
