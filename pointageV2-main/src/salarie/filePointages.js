// ═══ File d'attente des pointages ═══════════════════════════════════════
// Un hôtel se ponce en sous-sol, en lingerie, dans un ascenseur : le réseau
// n'est pas garanti au moment exact où la salariée scanne. Un pointage perdu
// est une prestation non payée et non facturée — alors on ne perd jamais un
// pointage : on l'écrit d'abord ici, on l'envoie ensuite.
//
// IndexedDB plutôt que localStorage : le stockage doit survivre à une fermeture
// brutale de l'application, et rester lisible par plusieurs onglets.

const BASE = 'ptg5p';
const STORE = 'envois';
const VERSION = 1;

let connexion = null;
function ouvrir() {
  if (connexion) return connexion;
  connexion = new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE, VERSION);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
  return connexion;
}

async function transaction(mode, action) {
  const db = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    const tr = db.transaction(STORE, mode);
    const resultat = action(tr.objectStore(STORE));
    tr.oncomplete = () => resoudre(resultat?.result ?? resultat);
    tr.onerror = () => rejeter(tr.error);
  });
}

const nouvelId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Met un pointage en attente d'envoi. Retourne l'entrée créée. */
export async function empiler(corps) {
  const entree = { id: nouvelId(), corps, cree: new Date().toISOString(), tentatives: 0, echec: null };
  await transaction('readwrite', (s) => s.put(entree));
  previenir();
  return entree;
}

/** Tous les pointages en attente, du plus ancien au plus récent. */
export async function enAttente() {
  const tout = await transaction('readonly', (s) => s.getAll());
  return (tout || []).sort((a, b) => a.cree.localeCompare(b.cree));
}

export async function retirer(id) {
  await transaction('readwrite', (s) => s.delete(id));
  previenir();
}

async function majEntree(entree) {
  await transaction('readwrite', (s) => s.put(entree));
  previenir();
}

// ── Abonnement : l'interface suit l'état de la file ──
const abonnes = new Set();
export function surChangement(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function previenir() { abonnes.forEach((fn) => fn()); }

/**
 * Une panne de réseau se rejoue plus tard ; un refus métier, jamais.
 * « Ce QR n'est pas un QR 5P STAR » ne deviendra pas vrai en réessayant —
 * il faut le dire tout de suite à la salariée.
 */
export function estPanneReseau(err) {
  if (!err) return false;
  if (err.status === undefined) return true;              // fetch rejeté, coupure, DNS
  return err.status === 408 || err.status === 429 || err.status >= 500;
}

/**
 * Vide la file dans l'ordre. L'ordre est vital : une arrivée doit atteindre
 * le serveur avant le départ qui la clôture.
 * S'arrête à la première panne réseau — inutile d'épuiser la liste hors couverture.
 */
export async function vider(envoyer) {
  const resultats = [];
  for (const entree of await enAttente()) {
    if (entree.echec) continue;                            // déjà refusé, en attente d'un geste
    try {
      const reponse = await envoyer(entree.corps);
      await retirer(entree.id);
      resultats.push({ entree, reponse });
    } catch (err) {
      if (estPanneReseau(err)) break;
      await majEntree({ ...entree, tentatives: entree.tentatives + 1, echec: err.message || 'Envoi refusé' });
      resultats.push({ entree, erreur: err.message });
    }
  }
  return resultats;
}
