// Authentification du salarié par son jeton personnel (règle d'or : 1 lien = 1 salarié)
import { T, lister, F, echapper } from './airtable.js';

/** Retourne le record du salarié correspondant au jeton, ou null. */
export async function salarieParJeton(jeton) {
  if (!jeton || typeof jeton !== 'string' || jeton.length < 12 || jeton.length > 64) return null;
  const enregistrements = await lister(T.SALARIES, {
    formule: `{Jeton} = '${echapper(jeton)}'`,
  });
  if (enregistrements.length !== 1) return null; // 0 = inconnu, >1 = collision anormale
  return enregistrements[0];
}

/** Récupère le salarié depuis l'en-tête X-Jeton, ou répond 401. */
export async function exigerSalarie(req, res) {
  const jeton = req.headers['x-jeton'] || req.query?.jeton;
  const salarie = await salarieParJeton(jeton);
  if (!salarie) {
    res.status(401).json({ error: 'Lien invalide ou expiré. Contacte ton responsable.' });
    return null;
  }
  const statut = F(salarie, 'Statut');
  if (statut && /inactif|archiv|parti/i.test(String(statut?.name || statut))) {
    res.status(403).json({ error: 'Ce compte est désactivé.' });
    return null;
  }
  return salarie;
}

export const profil = (s) => ({
  id: s.id,
  nom: F(s, 'Nom') || '',
  prenom: (F(s, 'Nom') || '').split(' ')[0],
  tauxHoraire: F(s, 'Taux Horaire') || 0,
});
