import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";

// ─────────────────────────────────────────────────────────────────────────────
// Upload centralisé, production-grade pour gros fichiers (MP4 multi-Go).
//
// Historique du bug : l'app appelait `Core.UploadPublicFile`, un endpoint qui
// n'existe pas côté Base44. Le module integrations du SDK est un Proxy dynamique
// qui laisse passer n'importe quel nom → la requête partait quand même vers
// l'API. Comme `appId` valait `undefined` (VITE_BASE44_APP_ID absent de
// l'environnement), l'URL devenue `/api/apps/undefined/integration-endpoints/...`
// n'était routée par le backend : le contexte d'app restait `None` côté serveur
// (d'où `{'app_id': None, 'app_owner': None}` dans l'erreur), l'upload était
// traité par le wrapper Python générique sans quota/streaming correct, et le
// buffer SSL du serveur saturait sur plusieurs Go →
//   "[BUF] malloc failure (_ssl.c:2437)" = WriteTimeout + OOM réseau.
//
// Solution en deux niveaux :
//  1. Fichiers < SEUIL_UPLOAD_DIRECT (images, audio courts…) : upload monolith
//     via l'API officielle Core.UploadFile (identique à avant, rapide).
//  2. Gros fichiers (films) : upload MORCEAUÉ + REPRENABLE — le fichier est
//     découpé en chunks de 8 Mo envoyés un par un avec retries exponentiels,
//     assemblés côté serveur par la fonction backend `upload_chunk`, puis
//     publiés via Core.UploadFile. Chaque chunk étant petit, plus jamais de
//     timeout d'écriture ni de saturation mémoire, et une coupure réseau ne
//     coûte que le chunk en cours (reprise automatique).
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_BASE = appParams.appBaseUrl || "https://base44.app";
export const REMOTE_APP_URL = "https://chay.base44.app";

/** Taille des morceaux : 8 Mo — assez gros pour la bande passante, assez petit
 *  pour finir en < 30 s même sur une connexion instable. */
export const CHUNK_SIZE = 8 * 1024 * 1024;
/** Au-delà de cette taille, on bascule automatiquement en mode morcelé. */
export const SEUIL_UPLOAD_DIRECT = 15 * 1024 * 1024; // 15 Mo
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pickUrl = (res) => {
  if (!res) return null;
  if (typeof res === "string") return /^https?:\/\//i.test(res) ? res : null;
  const url =
    res.file_url || res.url || res.uri || res.data?.file_url || res.data?.url || null;
  return url && /^https?:\/\//i.test(url) ? url : null;
};

/** En-têtes d'authentification Base44 pris SUR CHAQUE requête (et pas figés à
 *  la construction du client) : un login/logout pendant un long upload est
 *  ainsi toujours pris en compte. */
function authHeaders(extra = {}) {
  const token = appParams.token || base44.config?.token;
  return {
    "X-App-Id": String(appParams.appId ?? ""),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** Upload monolithique officiel (petits fichiers). */
async function directUpload(file) {
  const res = await base44.integrations.Core.UploadFile({ file });
  const url = pickUrl(res);
  if (!url) {
    throw new Error(
      "Échec du téléversement : réponse d'upload inattendue (" +
        JSON.stringify(res)?.slice(0, 120) +
        ")"
    );
  }
  return url;
}

/** POST avec retry exponentiel — résiste aux coupures réseau. */
async function postWithRetry(url, body, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(opts.headers || {}),
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        err.retryable = res.status >= 500 || res.status === 429;
        throw err;
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      const networkLevel = !err.retryable && !(err.name === "AbortError" && attempt > 0);
      if (attempt === MAX_RETRIES) break;
      if (!err.retryable && !networkLevel && err.message?.startsWith("HTTP 4")) break;
      await sleep(Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300);
    }
  }
  throw lastErr;
}

/**
 * Upload morcelé + reprenable pour les gros médias.
 * @param {File} file
 * @param {(pct:number)=>void} [onProgress] progression 0→100
 * @returns {Promise<string>} URL publique du fichier
 */
export async function uploadChunked(file, onProgress) {
  // 1. Ouverture de la session d'upload (id déterministe = reprise auto après
  //    rechargement de page si le même fichier est sélectionné à nouveau).
  const sessionId = btoa(`${file.name}:${file.size}:${file.lastModified}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);

  const fnUrl = `${SERVER_BASE}/api/functions/upload_chunk`;

  const init = await postWithRetry(fnUrl, JSON.stringify({ action: "init", session_id: sessionId, name: file.name, size: file.size }), {
    headers: { "Content-Type": "application/json" },
  });
  if (init?.error) throw new Error(init.error);

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploaded = new Set(Array.isArray(init?.uploaded) ? init.uploaded : []);

  // 2. Envoi morceau par morceau (les morceaux déjà présents côté serveur sont
  //    sautés → reprise après coupure sans renvoyer tout le fichier).
  let done = uploaded.size;
  for (let i = 0; i < totalChunks; i++) {
    if (uploaded.has(i)) continue;
    const blob = file.slice(i * CHUNK_SIZE, Math.min(file.size, (i + 1) * CHUNK_SIZE));
    const fd = new FormData();
    fd.append("action", "chunk");
    fd.append("session_id", sessionId);
    fd.append("index", String(i));
    fd.append("total", String(totalChunks));
    fd.append("name", file.name);
    fd.append("chunk", blob, `${sessionId}_${i}`);
    const res = await postWithRetry(fnUrl, fd, { timeoutMs: 120_000 });
    if (res?.error) throw new Error(res.error);
    uploaded.add(i);
    done += 1;
    onProgress?.(Math.round((done / totalChunks) * 95));
  }

  // 3. Assemblage côté serveur + publication via le stockage public officiel.
  onProgress?.(97);
  const fin = await postWithRetry(fnUrl, JSON.stringify({ action: "finalize", session_id: sessionId, name: file.name }), {
    headers: { "Content-Type": "application/json" },
    timeoutMs: 300_000, // l'assemblage peut prendre un moment, mais jamais de EOF prematuré
  });
  if (fin?.error) throw new Error(fin.error);
  const url = pickUrl(fin);
  if (!url) throw new Error("Upload terminé mais aucune URL reçue (" + JSON.stringify(fin)?.slice(0, 120) + ")");
  onProgress?.(100);
  return url;
}

/** Point d'entrée unique utilisé par toute l'app. Bascule auto direct/chunké. */
export async function uploadToBase44(file, { forceChunked = false, onProgress } = {}) {
  if (!appParams.appId) {
    throw new Error(
      "Configuration manquante : VITE_BASE44_APP_ID est vide → le backend reçoit app_id=None et rejette l'upload. Renseignez-le (base44 link / .env.local)."
    );
  }
  if (!forceChunked && file.size <= SEUIL_UPLOAD_DIRECT) {
    return directUpload(file);
  }
  return uploadChunked(file, onProgress);
}
