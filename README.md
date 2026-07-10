# 5P STAR — Application de pointage (PWA)

Une seule application, deux univers :

| Univers | Lien | Accès |
|---|---|---|
| **Panneau administrateur** | `https://VOTRE-DOMAINE/admin` | simple lien, sans mot de passe |
| **App salariée** | `https://VOTRE-DOMAINE/s/{jeton}` | 1 lien unique par salariée — colonne **« Lien application »** de la table Salariés dans Airtable |

Les jetons sont déjà générés dans Airtable (champ « Jeton » de la table Salariés). Il suffit d'envoyer à chaque salariée son lien par SMS : à la première ouverture, l'app la reconnaît définitivement sur son téléphone.

## Déploiement (10 minutes)

1. **GitHub** — créer un dépôt et y pousser ce dossier (ou l'importer via « Upload files »).
2. **Jeton Airtable** — sur https://airtable.com/create/tokens : portées `data.records:read` + `data.records:write`, accès à la base **appHlqfEa5sJhNixT**.
3. **Vercel** — https://vercel.com → *Add New Project* → importer le dépôt. Framework : **Vite** (détecté). Dans *Environment Variables* :
   - `AIRTABLE_TOKEN` = le jeton créé à l'étape 2
   - `APP_URL` = l'URL du projet (ex. `https://pointage-5pstar.vercel.app`)
4. **Déployer**, puis vérifier `https://…/admin`.

## Après le déploiement — 2 réglages dans Airtable

- **Formule « Lien application »** (table Salariés) : remplacer `https://pointage-5pstar.vercel.app` par votre URL réelle si différente.
- **Onglet QR codes** : réimprimer les planches si `APP_URL` a changé (le QR encode l'URL).

## Fonctionnement du pointage

- **Un QR par hôtel**, imprimé et affiché sur place — indépendant des salariées et des prestations.
- La salariée scanne à l'arrivée puis au départ, **soit** avec le scanner intégré de l'app, **soit** avec l'appareil photo du téléphone (le QR ouvre l'app et pointe automatiquement).
- La prestation est déduite de l'affectation planifiée du jour ; sinon l'app la demande.
- Garde-fous : impossible d'ouvrir deux missions en même temps ; alerte si un départ n'est pas scanné sous 12 h ; rectification manuelle tracée côté admin.

## Installer comme une app (iPhone / Android)

- **iPhone** : ouvrir le lien dans Safari → Partager → « Sur l'écran d'accueil ».
- **Android** : ouvrir dans Chrome → menu ⋮ → « Ajouter à l'écran d'accueil ».

## À compléter dans Airtable

- `Tarif horaire facturation` (table Prestations) — valeurs de démonstration à ajuster.
- `Taux Horaire` (table Salariés) — manquant pour 12 salariées sur 15.
- Table Affectations : l'ancien champ `Field 8` peut être supprimé manuellement (remplacé par « Heure prévue »).

## Tests

`node test-fonctionnel.mjs` — 29 vérifications (authentification par jeton, scan arrivée/départ/anomalies, calculs heures et gains, factures, budget, QR codes).
