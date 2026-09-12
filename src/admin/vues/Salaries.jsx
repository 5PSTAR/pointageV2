import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

const STATUTS = ['CDI', 'CDD', 'Stage', 'Alternance', 'Actif', 'Inactif', 'En congé'];
const DEGRADES = [
  'linear-gradient(135deg,#3D8ACE,#91BC47)', 'linear-gradient(135deg,#B98BE0,#3D8ACE)',
  'linear-gradient(135deg,#E38837,#91BC47)', 'linear-gradient(135deg,#3D8ACE,#B98BE0)',
  'linear-gradient(135deg,#91BC47,#3D8ACE)', 'linear-gradient(135deg,#E38837,#B98BE0)',
  'linear-gradient(135deg,#B98BE0,#91BC47)', 'linear-gradient(135deg,#3D8ACE,#E38837)',
];
const degrade = (nom) => DEGRADES[(nom || '').length % DEGRADES.length];
const initiales = (nom) => (nom || '?').split(' ').map((m) => m[0]).slice(0, 2).join('').toUpperCase();
const classeStatut = (s) => s === 'CDI' ? 'cdi' : s === 'CDD' ? 'cdd' : s === 'Stage' ? 'stage' : 'altern';
const telHref = (t) => 'tel:' + String(t || '').replace(/\s/g, '');

function Avatar({ s, taille }) {
  const style = s.photo
    ? { backgroundImage: `url(${s.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: degrade(s.nom) };
  return <div className="avatar" style={{ ...style, ...(taille ? { width: taille, height: taille, fontSize: taille / 3.1 } : {}) }}>{s.photo ? '' : initiales(s.nom)}</div>;
}

// ── Champ photo (fichier → base64) ──
function ChampPhoto({ photo, setPhoto, apercu }) {
  const ref = useRef(null);
  const [prev, setPrev] = useState(apercu || null);
  function choisir(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { alert('Photo trop lourde (4 Mo max).'); return; }
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const base64 = String(lecteur.result).split(',')[1];
      setPhoto({ base64, contentType: f.type, filename: f.name });
      setPrev(String(lecteur.result));
    };
    lecteur.readAsDataURL(f);
  }
  return (
    <div className="upload-photo">
      <div className="apercu" style={prev ? { backgroundImage: `url(${prev})` } : {}}>{prev ? '' : '📷'}</div>
      <div className="infos">
        <div className="lb">Photo</div>
        <div className="in">JPG ou PNG · optionnel · 4 Mo max</div>
      </div>
      <button type="button" className="btn mini" onClick={() => ref.current?.click()}>Choisir…</button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={choisir} />
    </div>
  );
}

// ── Modale de création ──
function ModaleCreation({ fermer, apres }) {
  const [f, setF] = useState({ prenom: '', nom: '', telephone: '', email: '', statut: '', taux: '' });
  const [photo, setPhoto] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function creerSalarie() {
    if (!f.prenom.trim() || !f.nom.trim()) return setErreur('Prénom et nom sont obligatoires.');
    if (!f.telephone.trim()) return setErreur('Le téléphone est obligatoire.');
    setEnvoi(true); setErreur('');
    try {
      await api('/api/admin/salaries', { method: 'POST', body: {
        nom: `${f.prenom.trim()} ${f.nom.trim()}`,
        telephone: f.telephone, email: f.email, statut: f.statut || undefined,
        taux: f.taux || undefined, photo,
      }});
      apres('Salarié créé — son lien personnel est visible sur sa fiche, prêt à être copié.');
    } catch (e) { setErreur(e.message); setEnvoi(false); }
  }

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale">
        <h2>Créer un salarié</h2>
        <p className="muted petit" style={{ marginBottom: 18 }}>Le jeton personnel et le lien de l'app seront générés automatiquement.</p>
        <ChampPhoto photo={photo} setPhoto={setPhoto} />
        <div style={{ height: 12 }}></div>
        <div className="deux-colonnes">
          <div className="champ"><label>Prénom *</label><input value={f.prenom} onChange={maj('prenom')} placeholder="Camille" /></div>
          <div className="champ"><label>Nom *</label><input value={f.nom} onChange={maj('nom')} placeholder="Lefevre" /></div>
        </div>
        <div className="champ"><label>Téléphone *</label><input type="tel" value={f.telephone} onChange={maj('telephone')} placeholder="+33 6 45 67 89 01" /></div>
        <div className="champ"><label>Email</label><input type="email" value={f.email} onChange={maj('email')} placeholder="prenom.nom@email.com" /></div>
        <div className="deux-colonnes">
          <div className="champ"><label>Statut</label>
            <select value={f.statut} onChange={maj('statut')}>
              <option value="">— Choisir —</option>
              {STATUTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="champ"><label>Taux horaire (€)</label><input type="number" step="0.5" value={f.taux} onChange={maj('taux')} placeholder="16" /></div>
        </div>
        {erreur && <div className="bandeau erreur">{erreur}</div>}
        <div className="pied-modale">
          <button className="btn" onClick={fermer}>Annuler</button>
          <button className="btn bleu" onClick={creerSalarie} disabled={envoi}>{envoi ? 'Création…' : '✅ Créer le salarié'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Brouillon d'e-mail prêt à relire et envoyer (mailto:) ──
// Le projet n'embarque aucun service d'envoi : on ouvre la messagerie de
// l'administrateur avec destinataire, objet et corps déjà remplis, à lui de
// relire puis d'envoyer. Le champ Email d'Airtable n'étant pas contrôlé (on y
// trouve des valeurs comme « ok »), on vérifie la forme avant de proposer
// l'action, pour ne pas ouvrir un brouillon adressé à n'importe quoi.
const adresseValide = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());

function lienMailto({ nom, email, lien }) {
  const prenom = String(nom || '').trim().split(/\s+/)[0];
  const objet = 'Ton lien personnel — application de pointage 5P STAR';
  const corps = [
    `Bonjour ${prenom},`,
    '',
    'Voici ton lien personnel pour l’application de pointage 5P STAR :',
    lien,
    '',
    'Ouvre-le depuis ton téléphone : l’application te reconnaîtra ensuite à chaque fois.',
    'Tu peux l’ajouter à ton écran d’accueil pour t’en servir comme d’une application.',
    '',
    'Ce lien t’est personnel : ne le transmets à personne.',
    '',
    'L’équipe 5P STAR',
  ].join('\n');
  return `mailto:${email.trim()}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}

const IcoMail = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" />
  </svg>
);

// ── Copie dans le presse-papiers, avec retour visuel ──
// L'API Clipboard demande un contexte sécurisé et peut rester bloquée par la
// politique de permissions de la page. On retombe alors sur execCommand, plus
// ancien mais accepté là où l'API ne l'est pas ; en dernier recours on le dit
// plutôt que d'échouer en silence, l'URL restant sélectionnable à la main.
function copieDeSecours(texte) {
  try {
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand('copy');
    zone.remove();
    return ok;
  } catch { return false; }
}

function BoutonCopier({ texte, className, libelle = 'Copier le lien' }) {
  const [etat, setEtat] = useState('');
  async function copier() {
    let ok = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('API presse-papiers indisponible');
      await navigator.clipboard.writeText(texte);
      ok = true;
    } catch { ok = copieDeSecours(texte); }
    setEtat(ok ? 'ok' : 'echec');
    setTimeout(() => setEtat(''), 2200);
  }
  return (
    <button type="button" className={className} onClick={copier} title={texte}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
        <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      {etat === 'ok' ? 'Copié' : etat === 'echec' ? 'Copie refusée' : libelle}
    </button>
  );
}

// ── Fiche détaillée ──
function FicheSalarie({ id, fermer, apres }) {
  const [fiche, setFiche] = useState(null);
  const [erreur, setErreur] = useState('');
  const [form, setForm] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [confirmerSuppr, setConfirmerSuppr] = useState(false);

  useEffect(() => {
    api(`/api/admin/salaries?fiche=${id}`).then((d) => {
      setFiche(d);
      setForm({ nom: d.profil.nom, telephone: d.profil.telephone, email: d.profil.email, statut: d.profil.statut, taux: d.profil.taux });
    }).catch((e) => setErreur(e.message));
  }, [id]);

  const maj = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  const jour = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—';
  const eur = (n) => (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  const fmtDuree = (h) => h != null ? `${String(h).replace('.', ',')} h` : null;

  async function enregistrer() {
    setEnvoi(true); setErreur('');
    try {
      await api('/api/admin/salaries', { method: 'PATCH', body: { id, ...form, photo } });
      apres('Fiche mise à jour.');
    } catch (e) { setErreur(e.message); setEnvoi(false); }
  }

  async function supprimerSalarie() {
    setEnvoi(true); setErreur('');
    try {
      await api(`/api/admin/salaries?id=${id}`, { method: 'DELETE' });
      apres('Salarié supprimé.');
    } catch (e) { setErreur(e.message); setEnvoi(false); setConfirmerSuppr(false); }
  }

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div className="modale large">
        {erreur && <div className="bandeau erreur">{erreur}</div>}
        {!fiche ? <p className="muted">Chargement de la fiche…</p> : (
          <>
            <div className="fiche-detail">
              <Avatar s={fiche.profil} taille={82} />
              <div className="infos-tete">
                <h2>{fiche.profil.nom}</h2>
                <div className="meta">
                  <span>{fiche.profil.statut || '—'}</span> ·
                  <a href={telHref(fiche.profil.telephone)}>{fiche.profil.telephone || '—'}</a>
                  {fiche.profil.email && <> · <a href={`mailto:${fiche.profil.email}`}>{fiche.profil.email}</a></>}
                </div>
              </div>
              <button className="btn mini" onClick={fermer}>✕</button>
            </div>

            {fiche.alertes.length > 0 && (
              <div className="section-fiche">
                <h3><span className="puce" style={{ background: 'var(--orange)' }}></span>Alertes</h3>
                {fiche.alertes.map((a, i) => (
                  <div className="alerte-fiche" key={i}>
                    <div className="t">⚠ {a.titre}</div>
                    <div className="d">{a.detail}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="section-fiche">
              <h3><span className="puce" style={{ background: 'var(--bleu)' }}></span>Lien personnel de l'application</h3>
              {fiche.profil.lien ? (
                <>
                  <div className="lien-app">
                    <span className="url mono">{fiche.profil.lien}</span>
                    <div className="actions-lien">
                      <a className="btn mini" href={fiche.profil.lien} target="_blank" rel="noopener noreferrer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6M10 14L21 3" />
                        </svg>
                        Ouvrir
                      </a>
                      <BoutonCopier texte={fiche.profil.lien} className="btn mini" />
                      {adresseValide(fiche.profil.email) ? (
                        <a className="btn mini" href={lienMailto(fiche.profil)}>{IcoMail}Envoyer par mail</a>
                      ) : (
                        <button className="btn mini" disabled title={fiche.profil.email
                          ? `Adresse inexploitable dans Airtable : « ${fiche.profil.email} »`
                          : 'Aucune adresse e-mail renseignée pour cette salariée.'}>
                          {IcoMail}Envoyer par mail
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="muted petit" style={{ marginTop: 7 }}>
                    À envoyer par SMS ou par mail à {fiche.profil.nom} : ce lien l'identifie à elle seule, il ne se partage pas.
                    L'ouvrir ici enregistre son jeton sur <strong>ce</strong> navigateur — pour le tester, passe par une fenêtre privée.
                    {!adresseValide(fiche.profil.email) && (
                      <> L'envoi par mail est indisponible : {fiche.profil.email
                        ? <>l'adresse renseignée (« {fiche.profil.email} ») n'en est pas une.</>
                        : <>aucune adresse n'est renseignée.</>}</>
                    )}
                  </p>
                </>
              ) : (
                <p className="muted petit">
                  Aucun lien : le champ « Lien application » est vide dans Airtable, sans doute faute de jeton.
                </p>
              )}
            </div>

            <div className="section-fiche">
              <h3><span className="puce" style={{ background: 'var(--vert)' }}></span>Facturation</h3>
              <div className="facturation-double">
                <div className="mini-carte-factu">
                  <div className="p">Ce mois-ci (à date)</div>
                  <div className="m mono">{eur(fiche.facturation.moisCourant.montant)} €</div>
                  <div className="h">{String(fiche.facturation.moisCourant.heures).replace('.', ',')} h · {fiche.facturation.moisCourant.nb} prestation(s)</div>
                </div>
                <div className="mini-carte-factu gris">
                  <div className="p">Mois dernier</div>
                  <div className="m mono">{eur(fiche.facturation.moisPrecedent.montant)} €</div>
                  <div className="h">{String(fiche.facturation.moisPrecedent.heures).replace('.', ',')} h · {fiche.facturation.moisPrecedent.nb} prestation(s)</div>
                </div>
              </div>
            </div>

            <div className="section-fiche">
              <h3><span className="puce" style={{ background: 'var(--bleu)' }}></span>Derniers badgeages</h3>
              {fiche.badgeages.length === 0 && <p className="muted petit">Aucun pointage sur les deux derniers mois.</p>}
              {fiche.badgeages.map((p) => (
                <div className="pointage-mini" key={p.id}>
                  <div className="g">
                    <div className="h">{p.hotel}</div>
                    <div className="d">
                      {p.prestation} · {jour(p.date)} {heure(p.arrivee)}{p.depart ? ` → ${heure(p.depart)}` : p.statut === 'En cours' ? ' → en cours' : ' → départ non scanné'}
                    </div>
                  </div>
                  <span className="duree">
                    {p.statut === 'En cours' ? 'en cours' : p.statut === 'Anomalie' ? '⚠' : fmtDuree(p.duree) || '—'}
                  </span>
                </div>
              ))}
            </div>

            <div className="section-fiche">
              <h3><span className="puce" style={{ background: 'var(--violet)' }}></span>Informations éditables</h3>
              <ChampPhoto photo={photo} setPhoto={setPhoto} apercu={fiche.profil.photo} />
              <div style={{ height: 11 }}></div>
              <div className="deux-cols-fiche">
                <div className="champ-inline"><label>Nom complet</label><input value={form.nom} onChange={maj('nom')} /></div>
                <div className="champ-inline"><label>Téléphone</label><input type="tel" value={form.telephone} onChange={maj('telephone')} /></div>
                <div className="champ-inline"><label>Email</label><input type="email" value={form.email} onChange={maj('email')} /></div>
                <div className="champ-inline"><label>Statut</label>
                  <select value={form.statut} onChange={maj('statut')}>
                    <option value="">—</option>
                    {STATUTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="champ-inline"><label>Taux horaire (€)</label><input type="number" step="0.5" value={form.taux} onChange={maj('taux')} /></div>
              </div>
            </div>

            <div className="pied-modale">
              <button className="btn rouge" onClick={() => setConfirmerSuppr(true)} disabled={envoi}>🗑️ Supprimer</button>
              <button className="btn" onClick={fermer}>Annuler</button>
              <button className="btn vert" onClick={enregistrer} disabled={envoi}>{envoi ? 'Enregistrement…' : '💾 Enregistrer'}</button>
            </div>
          </>
        )}

        {confirmerSuppr && (
          <div className="voile actif" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && setConfirmerSuppr(false)}>
            <div className="modale" style={{ maxWidth: 420 }}>
              <div className="confirm-supprimer">
                <div className="icone">🗑️</div>
                <h2>Supprimer ce salarié ?</h2>
                <p className="muted" style={{ marginBottom: 18 }}>Cette action est irréversible. Les pointages passés seront conservés, mais {fiche?.profil.nom} ne pourra plus se connecter à l'application.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmerSuppr(false)}>Annuler</button>
                  <button className="btn rouge" style={{ flex: 1, justifyContent: 'center' }} onClick={supprimerSalarie} disabled={envoi}>Confirmer</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vue principale : trombinoscope ──
export default function Salaries() {
  const [salaries, setSalaries] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [creation, setCreation] = useState(false);
  const [ficheId, setFicheId] = useState(null);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = () => api('/api/admin/salaries').then((d) => setSalaries(d.salaries)).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); }, []);

  const apresAction = (msg) => {
    setCreation(false); setFicheId(null);
    setInfo(msg); setTimeout(() => setInfo(''), 6000);
    charger();
  };

  const filtre = recherche.toLowerCase().trim();
  const visibles = (salaries || []).filter((s) => !filtre || s.nom.toLowerCase().includes(filtre));

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Salariés</h1>
          {salaries && <p className="muted petit" style={{ marginTop: 4 }}>{salaries.length} salarié(s) — trombinoscope</p>}
        </div>
        <button className="btn bleu" onClick={() => setCreation(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Créer un salarié
        </button>
      </div>

      <div className="barre-recherche">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher par nom ou prénom…" />
      </div>

      {info && <div className="bandeau ok">{info}</div>}
      {erreur && <div className="bandeau erreur">{erreur}</div>}
      {!salaries && !erreur && <p className="muted">Chargement du trombinoscope…</p>}

      {salaries && (
        <div className="grille-tromb">
          {visibles.length === 0 && <p className="muted" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>Aucun salarié ne correspond à cette recherche.</p>}
          {visibles.map((s) => (
            <div className="carte-salarie" key={s.id} onClick={() => setFicheId(s.id)}>
              <span className={`chip-statut ${classeStatut(s.statut)}`}>{s.statut || '—'}</span>
              <Avatar s={s} />
              <div className="nom-salarie">{s.nom}</div>
              <div className="role-salarie">{s.statut || '—'}{s.taux ? ` · ${s.taux} €/h` : ''}</div>
              <div className="tel-salarie mono">{s.telephone || '—'}</div>
              <div className="actions-carte" onClick={(e) => e.stopPropagation()}>
                {s.telephone && (
                  <a className="appeler" href={telHref(s.telephone)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" /></svg>
                    Appeler
                  </a>
                )}
                {s.lien && <BoutonCopier texte={s.lien} libelle="Lien" />}
                <button onClick={() => setFicheId(s.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Éditer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creation && <ModaleCreation fermer={() => setCreation(false)} apres={apresAction} />}
      {ficheId && <FicheSalarie id={ficheId} fermer={() => setFicheId(null)} apres={apresAction} />}
    </>
  );
}
