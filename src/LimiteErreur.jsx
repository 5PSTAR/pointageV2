import { Component } from 'react';

/**
 * Filet de sécurité. Sans lui, la moindre erreur de rendu vide la page : la
 * salariée se retrouve devant un écran blanc, sans savoir si son pointage est
 * passé, et sans rien à raconter à son responsable. On préfère un message
 * lisible, le moyen de repartir, et le détail de l'erreur à recopier.
 */
export default class LimiteErreur extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, infos) {
    // Visible dans la console du téléphone branché, et dans les logs Vercel
    // si une remontée est ajoutée plus tard.
    console.error('Écran en erreur :', erreur, infos?.componentStack);
  }

  render() {
    if (!this.state.erreur) return this.props.children;

    const texte = String(this.state.erreur?.message || this.state.erreur);
    return (
      <div className="accueil-neutre" style={{ minHeight: '100vh', padding: 24 }}>
        <div className="marque">
          <div className="badge">5P</div>
          <div><div className="nom">5P STAR</div><div className="sous">Un écran s'est mal affiché</div></div>
        </div>
        <p className="muted petit" style={{ maxWidth: 340, textAlign: 'center', marginTop: 14 }}>
          Ton pointage n'est pas perdu : s'il était en attente d'envoi, il partira tout seul.
          Recharge l'application pour continuer.
        </p>
        <button className="btn bleu" style={{ marginTop: 18, justifyContent: 'center' }}
          onClick={() => window.location.replace('/')}>
          Recharger l'application
        </button>
        <details style={{ marginTop: 22, maxWidth: 340, width: '100%' }}>
          <summary className="muted petit" style={{ cursor: 'pointer' }}>Détail technique</summary>
          <pre className="petit" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8, color: 'var(--orange)' }}>{texte}</pre>
        </details>
      </div>
    );
  }
}
