// Routeur unique /api/admin/* — regroupe les 8 endpoints admin en UNE fonction
// serverless (limite Vercel Hobby : 12 fonctions par déploiement).
// Les URLs restent identiques : /api/admin/dashboard, /api/admin/salaries, etc.
import dashboard from '../_lib/admin/dashboard.js';
import pointages from '../_lib/admin/pointages.js';
import calendrier from '../_lib/admin/calendrier.js';
import salaries from '../_lib/admin/salaries.js';
import facture from '../_lib/admin/facture.js';
import budget from '../_lib/admin/budget.js';
import qrcodes from '../_lib/admin/qrcodes.js';
import referentiels from '../_lib/admin/referentiels.js';

const ROUTES = { dashboard, pointages, calendrier, salaries, facture, budget, qrcodes, referentiels };

export default async function handler(req, res) {
  const route = ROUTES[req.query.route];
  if (!route) return res.status(404).json({ error: 'Route inconnue.' });
  return route(req, res);
}
