import { PB_URL, readPocketBaseToken } from "@/api/backendConfig";

// Appel d'une route du serveur Chay (/api/chay/...) avec le jeton du membre connecté.
// Renvoie le JSON de la réponse ; lève une erreur (message du serveur) si la réponse n'est pas « ok ».
export async function appelChay(chemin, { methode = "GET", corps, keepalive = false } = {}) {
  const token = readPocketBaseToken();
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = token;
  if (corps !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${PB_URL}${chemin}`, {
    method: methode,
    headers,
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
    keepalive,
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok) {
    const err = new Error(data?.error || data?.message || `Erreur ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}
