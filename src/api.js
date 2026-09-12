export const jetonStocke = () => localStorage.getItem('ptg5p_jeton') || '';

/**
 * Appel à l'API. `delai` borne l'attente : sans lui, une requête partie sur un
 * réseau qui ne répond plus laisse l'écran de pointage bloqué indéfiniment sur
 * « Enregistrement… », et la salariée repart en croyant avoir pointé.
 */
export async function api(chemin, { delai, ...options } = {}) {
  const arret = delai ? new AbortController() : null;
  const minuteur = arret ? setTimeout(() => arret.abort(), delai) : null;

  let res;
  try {
    res = await fetch(chemin, {
      headers: { 'Content-Type': 'application/json', 'X-Jeton': jetonStocke() },
      signal: arret?.signal,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    // Coupure, DNS, délai dépassé : pas de statut HTTP, donc rejouable.
    throw new Error(e.name === 'AbortError' ? 'Le réseau ne répond pas.' : 'Pas de connexion.');
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }

  // Une passerelle en erreur renvoie du HTML : res.json() lèverait une
  // SyntaxError illisible à la place du vrai problème.
  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const err = new Error(data?.error || `Erreur serveur (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
