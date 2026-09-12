// Envoi d'un pointage — avec repli sur la file d'attente en cas de coupure.
import { api } from '../api.js';
import { empiler, estPanneReseau, vider } from './filePointages.js';

const DELAI_MS = 15_000;
const CLE_ETAT = 'ptg5p_etat';

export const envoyerScan = (corps) =>
  api('/api/salarie/scan', { method: 'POST', body: corps, delai: DELAI_MS });

/**
 * Envoie le pointage, ou le met en file si le réseau manque.
 * L'horodatage est celui du scan, jamais celui de l'envoi : un pointage parti
 * de la file trois heures plus tard doit compter à l'heure où la salariée a
 * réellement scanné.
 */
export async function pointer(corps) {
  const complet = { horodatage: new Date().toISOString(), ...corps };
  try {
    return await envoyerScan(complet);
  } catch (err) {
    if (!estPanneReseau(err)) throw err;
    await empiler(complet);
    return { action: 'differe', differe: complet, message: 'Pointage enregistré sur ton téléphone. Il partira dès que le réseau revient.' };
  }
}

/**
 * Rejoue la file. Un pointage différé auquel le serveur répond « choisis ta
 * prestation » n'est pas enregistré : plutôt que de le laisser disparaître en
 * silence, on le marque en échec pour que l'écran le remonte à la salariée.
 */
export const viderFile = () => vider(async (corps) => {
  const r = await envoyerScan(corps);
  if (r.action === 'choisir-prestation' || r.action === 'confirmer-depart') {
    const e = new Error('Ce pointage attend une confirmation de ta part.');
    e.status = 409;
    throw e;
  }
  return r;
});

// ── Miroir local du dernier état connu ────────────────────────────────
// Hors réseau, l'application doit pouvoir décider seule s'il s'agit d'une
// arrivée ou d'un départ, et proposer la liste des prestations.
export function memoriserEtat(accueil) {
  try {
    localStorage.setItem(CLE_ETAT, JSON.stringify({
      enCours: accueil.enCours ? { id: accueil.enCours.id, hotelId: accueil.enCours.hotelId, hotel: accueil.enCours.hotel, arrivee: accueil.enCours.arrivee } : null,
      prochaine: accueil.prochaine || null,
      hotels: accueil.hotels || [],
      prestations: accueil.prestations || [],
      majLe: new Date().toISOString(),
    }));
  } catch { /* stockage plein ou refusé : on s'en passe */ }
}

export function etatConnu() {
  try { return JSON.parse(localStorage.getItem(CLE_ETAT) || 'null'); } catch { return null; }
}
