// Onglet Salariés — trombinoscope + fiche + création/édition/suppression.
// GET  /api/admin/salaries                → liste (trombinoscope)
// GET  /api/admin/salaries?fiche=recX     → fiche détaillée (badgeages, alertes, facturation)
// POST /api/admin/salaries                → création { nom, telephone, email, statut, taux, photo? }
//                                           (jeton 6-8 caractères généré automatiquement, unique)
// PATCH /api/admin/salaries               → édition { id, nom?, telephone?, email?, statut?, taux?, photo? }
// DELETE /api/admin/salaries?id=recX      → suppression du salarié
import crypto from 'node:crypto';
import {
  T, lister, creer, modifier, supprimer, uploaderPieceJointe,
  referentiels, lirePointage, F, aujourdhuiParis, moisDecale, echapper, envoyerErreur,
} from '../airtable.js';

const CHAMP_PHOTO = 'fldi2Le8N2rymHrIu'; // champ "Photo" (pièces jointes) de la table Salariés
const arrondi = (n) => Math.round(n * 100) / 100;

/** Jeton aléatoire 6-8 caractères [a-zA-Z0-9], garanti unique dans la base. */
function genererJeton(existants) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let essai = 0; essai < 50; essai++) {
    const longueur = 6 + crypto.randomInt(3); // 6, 7 ou 8
    let jeton = '';
    for (let i = 0; i < longueur; i++) jeton += chars[crypto.randomInt(chars.length)];
    if (!existants.has(jeton)) return jeton;
  }
  throw new Error('Impossible de générer un jeton unique');
}

function profilComplet(s) {
  const photos = F(s, 'Photo') || [];
  const statut = F(s, 'Statut');
  return {
    id: s.id,
    nom: F(s, 'Nom') || '',
    telephone: F(s, 'Téléphone') || '',
    email: F(s, 'Email') || '',
    statut: statut?.name || statut || '',
    taux: F(s, 'Taux Horaire') || 0,
    photo: photos[0]?.thumbnails?.large?.url || photos[0]?.url || null,
    lien: F(s, 'Lien application') || '',
  };
}

async function appliquerPhoto(recordId, photo) {
  if (!photo?.base64) return;
  await uploaderPieceJointe(recordId, CHAMP_PHOTO, {
    base64: photo.base64,
    contentType: photo.contentType || 'image/jpeg',
    filename: photo.filename || 'photo.jpg',
  });
}

export default async function handler(req, res) {
  try {
    // ── Suppression ──
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!/^rec[A-Za-z0-9]{14}$/.test(id || '')) return res.status(400).json({ error: 'Identifiant invalide.' });
      await supprimer(T.SALARIES, id);
      return res.json({ ok: true });
    }

    // ── Création ──
    if (req.method === 'POST') {
      const { nom, telephone, email, statut, taux, photo } = req.body || {};
      if (!nom?.trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
      if (!telephone?.trim()) return res.status(400).json({ error: 'Le téléphone est obligatoire.' });

      const existants = new Set((await lister(T.SALARIES, { champs: ['Jeton'] })).map((s) => F(s, 'Jeton')).filter(Boolean));
      const jeton = genererJeton(existants);

      const fields = {
        'Nom': nom.trim(),
        'Téléphone': telephone.trim(),
        'Jeton': jeton,
      };
      if (email?.trim()) fields['Email'] = email.trim();
      if (statut) fields['Statut'] = statut;
      if (taux != null && taux !== '') fields['Taux Horaire'] = Number(taux);

      const cree = await creer(T.SALARIES, fields);
      await appliquerPhoto(cree.id, photo);

      return res.json({ ok: true, id: cree.id, jeton });
    }

    // ── Édition ──
    if (req.method === 'PATCH') {
      const { id, nom, telephone, email, statut, taux, photo } = req.body || {};
      if (!/^rec[A-Za-z0-9]{14}$/.test(id || '')) return res.status(400).json({ error: 'Identifiant invalide.' });

      const fields = {};
      if (nom != null) fields['Nom'] = String(nom).trim();
      if (telephone != null) fields['Téléphone'] = String(telephone).trim();
      if (email != null) fields['Email'] = String(email).trim();
      if (statut != null) fields['Statut'] = statut;
      if (taux != null && taux !== '') fields['Taux Horaire'] = Number(taux);

      if (Object.keys(fields).length) await modifier(T.SALARIES, id, fields);
      await appliquerPhoto(id, photo);

      return res.json({ ok: true });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

    // ── Fiche détaillée ──
    if (req.query.fiche) {
      const ficheId = req.query.fiche;
      if (!/^rec[A-Za-z0-9]{14}$/.test(ficheId)) return res.status(400).json({ error: 'Identifiant invalide.' });

      const refs = await referentiels();
      const salarie = refs.iSalaries[ficheId];
      if (!salarie) return res.status(404).json({ error: 'Salarié introuvable.' });

      const profil = profilComplet(salarie);
      const auj = aujourdhuiParis();
      const moisCourant = auj.slice(0, 7);
      const moisPrecedent = moisDecale(moisCourant, -1);
      const nom = echapper(profil.nom);

      const bruts = await lister(T.POINTAGES, {
        formule: `AND({Salarié} = '${nom}', OR(DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${moisCourant}', DATETIME_FORMAT({Heure d'arrivée}, 'YYYY-MM') = '${moisPrecedent}'))`,
        tri: [{ field: "Heure d'arrivée", direction: 'desc' }],
      });
      const pointages = bruts.map((p) => lirePointage(p, refs));

      // Alertes propres à ce salarié : anomalies + mission ouverte depuis > 12 h
      const seuil = Date.now() - 12 * 3_600_000;
      const alertes = [];
      for (const p of pointages) {
        if (p.statut === 'En cours' && new Date(p.arrivee).getTime() < seuil) {
          alertes.push({ type: 'oubli', titre: 'Départ non pointé', detail: `${p.hotel} — arrivée ${new Date(p.arrivee).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}, aucun scan de départ.`, pointageId: p.id });
        } else if (p.statut === 'Anomalie') {
          alertes.push({ type: 'anomalie', titre: 'Anomalie', detail: `${p.hotel} (${p.prestation}) — ${p.date ? new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}${p.observation ? ' · ' + p.observation : ''}`, pointageId: p.id });
        }
      }

      // Facturation (rémunération) : mois courant à date + mois précédent
      const cumul = (mois) => {
        const lot = pointages.filter((p) => p.statut === 'Terminée' && p.duree && p.date?.startsWith(mois));
        const heures = arrondi(lot.reduce((s, p) => s + p.duree, 0));
        return { heures, montant: arrondi(heures * profil.taux), nb: lot.length };
      };

      return res.json({
        profil,
        alertes: alertes.slice(0, 5),
        facturation: { moisCourant: cumul(moisCourant), moisPrecedent: cumul(moisPrecedent) },
        badgeages: pointages.slice(0, 6),
      });
    }

    // ── Liste (trombinoscope) ──
    const salaries = await lister(T.SALARIES, { tri: [{ field: 'Nom' }] });
    res.json({ salaries: salaries.map(profilComplet) });
  } catch (err) { envoyerErreur(res, err); }
}
