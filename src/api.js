export const jetonStocke = () => localStorage.getItem('ptg5p_jeton') || '';

export async function api(chemin, options = {}) {
  const res = await fetch(chemin, {
    headers: { 'Content-Type': 'application/json', 'X-Jeton': jetonStocke() },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Erreur réseau');
    err.status = res.status;
    throw err;
  }
  return data;
}
