// Onglet QR codes — un QR unique par hôtel, INDÉPENDANT du salarié et de la prestation.
// Contenu = URL publique : scanné par l'appareil photo, il ouvre l'app qui reconnaît
// le salarié (jeton stocké) et déduit la prestation depuis l'affectation du jour.
// GET → liste des hôtels avec image QR (dataURL)
import QRCode from 'qrcode';
import { T, lister, F, envoyerErreur } from '../_lib/airtable.js';

export default async function handler(req, res) {
  try {
    const base = (process.env.APP_URL || 'https://pointage-5pstar.vercel.app').replace(/\/$/, '');
    const hotels = await lister(T.HOTELS, { tri: [{ field: 'Nom' }] });
    const qrcodes = [];
    for (const h of hotels) {
      qrcodes.push({
        id: h.id,
        hotel: F(h, 'Nom'),
        adresse: F(h, 'Adresse') || '',
        contact: F(h, 'Contact principal') || '',
        contenu: `${base}/q/${h.id}`,
        image: await QRCode.toDataURL(`${base}/q/${h.id}`, { width: 460, margin: 2, color: { dark: '#1E2A36' } }),
      });
    }
    res.json({ qrcodes });
  } catch (err) { envoyerErreur(res, err); }
}
