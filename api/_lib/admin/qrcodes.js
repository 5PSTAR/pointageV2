// Onglet QR codes — un QR unique par hôtel, INDÉPENDANT du salarié et de la prestation.
// Contenu = URL publique : scanné par l'appareil photo, il ouvre l'app qui reconnaît
// le salarié (jeton stocké) et déduit la prestation depuis l'affectation du jour.
// GET    → liste des hôtels avec image QR (dataURL) + champs éditables
// POST   → création d'un hôtel { nom, adresse, contact, telephone, siret }
//          (le QR est généré automatiquement puisqu'il découle de l'ID du record)
// PATCH  → modification { id, nom?, adresse?, contact?, telephone?, siret? }
// DELETE → suppression ?id=recXXX
import QRCode from 'qrcode';
import { T, lister, creer, modifier, supprimer, F, envoyerErreur } from '../airtable.js';

const construireChamps = ({ nom, adresse, contact, telephone, siret }) => {
  const fields = {};
  if (nom != null) fields['Nom'] = String(nom).trim();
  if (adresse != null) fields['Adresse'] = String(adresse).trim();
  if (contact != null) fields['Contact principal'] = String(contact).trim();
  if (telephone != null) fields['Téléphone'] = String(telephone).trim();
  if (siret != null && siret !== '') {
    const num = Number(String(siret).replace(/\s/g, ''));
    if (!Number.isFinite(num)) {
      const err = new Error('Le SIRET doit être un nombre (14 chiffres).');
      err.status = 400;
      throw err;
    }
    fields['SIRET'] = num;
  }
  return fields;
};

export default async function handler(req, res) {
  try {
    // ── Création ──
    if (req.method === 'POST') {
      const { nom } = req.body || {};
      if (!nom?.trim()) return res.status(400).json({ error: "Le nom de l'hôtel est obligatoire." });
      const cree = await creer(T.HOTELS, construireChamps(req.body));
      return res.json({ ok: true, id: cree.id });
    }

    // ── Modification ──
    if (req.method === 'PATCH') {
      const { id } = req.body || {};
      if (!/^rec[A-Za-z0-9]{14}$/.test(id || '')) return res.status(400).json({ error: 'Identifiant invalide.' });
      const fields = construireChamps(req.body);
      if (Object.keys(fields).length) await modifier(T.HOTELS, id, fields);
      return res.json({ ok: true });
    }

    // ── Suppression ──
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!/^rec[A-Za-z0-9]{14}$/.test(id || '')) return res.status(400).json({ error: 'Identifiant invalide.' });
      await supprimer(T.HOTELS, id);
      return res.json({ ok: true });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

    // ── Liste + QR générés à la volée (automatique pour tout nouvel hôtel) ──
    const base = (process.env.APP_URL || 'https://pointage-5pstar.vercel.app').replace(/\/$/, '');
    const hotels = await lister(T.HOTELS, { tri: [{ field: 'Nom' }] });
    const qrcodes = [];
    for (const h of hotels) {
      qrcodes.push({
        id: h.id,
        hotel: F(h, 'Nom'),
        adresse: F(h, 'Adresse') || '',
        contact: F(h, 'Contact principal') || '',
        telephone: F(h, 'Téléphone') || '',
        siret: F(h, 'SIRET') || '',
        contenu: `${base}/q/${h.id}`,
        image: await QRCode.toDataURL(`${base}/q/${h.id}`, { width: 460, margin: 2, color: { dark: '#1E2A36' } }),
      });
    }
    res.json({ qrcodes });
  } catch (err) { envoyerErreur(res, err); }
}
