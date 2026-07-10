// Routeur unique /api/salarie/* — regroupe les 5 endpoints salariée en UNE fonction.
// Les URLs restent identiques : /api/salarie/accueil, /api/salarie/scan, etc.
import accueil from '../_lib/routes-salarie/accueil.js';
import scan from '../_lib/routes-salarie/scan.js';
import missions from '../_lib/routes-salarie/missions.js';
import calendrier from '../_lib/routes-salarie/calendrier.js';
import heures from '../_lib/routes-salarie/heures.js';

const ROUTES = { accueil, scan, missions, calendrier, heures };

export default async function handler(req, res) {
  const route = ROUTES[req.query.route];
  if (!route) return res.status(404).json({ error: 'Route inconnue.' });
  return route(req, res);
}
