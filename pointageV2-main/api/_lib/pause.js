// ═══ Pause déduite ════════════════════════════════════════════════════
// Règle portée par le client, partagée par la facturation, la paie et
// l'application salariée : les trois doivent compter les MÊMES heures, sinon
// une salariée lit sur son téléphone plus que ce qu'elle touche.
import { F } from './airtable.js';

const arrondi = (n) => Math.round(n * 100) / 100;

// Certains clients demandent qu'une pause soit déduite de ce qu'on leur facture.
// Elle se compte PAR JOURNÉE et par salariée, pas par intervention : la salariée
// enchaîne ses vacations sans débadger, la pause n'est prise qu'une fois. Et elle
// ne se déduit qu'au-delà d'une présence suffisante — retirer trente minutes à une
// vacation d'un quart d'heure n'aurait aucun sens.
//
// DÉCIDÉ, PAS OUBLIÉ : si la salariée badge quand même sa sortie pour la pause,
// celle-ci sort deux fois — une fois du pointage, une fois ici. Le cas a été
// mesuré et écarté : le rattraper demandait de comparer l'amplitude de la journée
// au temps pointé, pour un gain qui ne vaut pas la complexité. La consigne terrain
// reste de ne pas débadger, et l'écart se corrige à la main depuis l'onglet
// Pointages. Ne pas « réparer » ceci sans rouvrir la question avec la gérante.
export const PRESENCE_MIN_POUR_PAUSE_H = 8;

/**
 * Retranche la pause du client aux durées facturées. Renvoie de NOUVEAUX objets :
 * les pointages d'origine ne sont jamais modifiés — ce sont eux qui servent aussi
 * à payer les salariées, et la pause est une règle de facturation client.
 * La déduction est portée par la plus longue intervention de la journée, celle
 * pendant laquelle la pause a réellement eu lieu.
 */
export function appliquerPause(pointages, minutesPause) {
  if (!minutesPause || minutesPause <= 0) return pointages;
  const heuresPause = minutesPause / 60;

  const parJournee = new Map();
  for (const p of pointages) {
    if (!p.date) continue;
    const cle = `${p.salarieId || '?'}|${p.date}`;
    if (!parJournee.has(cle)) parJournee.set(cle, []);
    parJournee.get(cle).push(p);
  }

  const aDeduire = new Map();   // id du pointage qui porte la pause → minutes
  for (const journee of parJournee.values()) {
    const total = journee.reduce((s, p) => s + (p.duree || 0), 0);
    if (total < PRESENCE_MIN_POUR_PAUSE_H) continue;
    const porteuse = journee.reduce((a, b) => ((b.duree || 0) > (a.duree || 0) ? b : a));
    aDeduire.set(porteuse.id, minutesPause);
  }

  return pointages.map((p) => (aDeduire.has(p.id)
    ? { ...p, duree: arrondi(Math.max(0, (p.duree || 0) - heuresPause)), dureeBrute: p.duree, pauseMinutes: minutesPause }
    : p));
}

/**
 * Applique à chaque pointage la pause de SON client. Le regroupement par
 * journée reste enfermé dans un même client : une salariée qui fait cinq
 * heures chez un hôtel avec pause puis quatre chez un hôtel sans pause n'a
 * atteint le seuil chez aucun des deux — ce serait une déduction volée.
 */
export function appliquerPauseParClient(pointages, refs) {
  const parClient = new Map();
  for (const p of pointages) {
    const cle = p.hotelId || '?';
    if (!parClient.has(cle)) parClient.set(cle, []);
    parClient.get(cle).push(p);
  }
  const sortie = [];
  for (const [hotelId, lot] of parClient) {
    sortie.push(...appliquerPause(lot, F(refs.iHotels[hotelId], 'Pause déduite (minutes)') || 0));
  }
  return sortie;
}
