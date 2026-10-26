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

/** POST avec retry exponentiel — résiste aux coupures réseau.
 *  @param {Object} opts
 *  @param {AbortSignal} [opts.signal] - signal d'annulation utilisateur
 *        ("Annuler" dans l'UI) : coupe la requête en cours ET empêche tout
 *        nouvelle tentative (l'erreur n'est pas "retryable" → boucle stoppée).
 */
async function postWithRetry(url, body, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (opts.signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
    try {
      // Timeout global = délai par défaut + temps consommé par les retries
      // déjà effectués (sinon un upload reprenable serait coupé au bout de
      // ~2 min alors qu'il progresse normalement).
      const elapsed = Math.min(30_000, 500 * 2 ** attempt) * attempt;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (opts.timeoutMs ?? 120_000) + elapsed);
      const onOuterAbort = () => controller.abort();
      opts.signal?.addEventListener("abort", onOuterAbort);
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: authHeaders(opts.headers || {}),
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onOuterAbort);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        err.retryable = res.status >= 500 || res.status === 429;
        throw err;
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      // Annulation volontaire de l'utilisateur : on remonte tout de suite.
      if (opts.signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
      const networkLevel = !err.retryable && !(err.name === "AbortError" && attempt > 0);
      if (attempt === MAX_RETRIES) break;
      if (!err.retryable && !networkLevel && err.message?.startsWith("HTTP 4")) break;
      await sleep(Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300);
    }
  }
  throw lastErr;
}

/** Formatage "Octets" FR pour la progression (ex: 2.3 Go / 5.1 Go). */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = n, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/**
 * Upload morcelé + reprenable pour les gros médias.
 * @param {File} file
 * @param {(pct:number)=>void} [onProgress] progression 0→100 (rétro-compatible)
 *        — ou objet de progression complet { onProgress, onDetail } voir ci-dessous.
 * @param {Object} [opts]
 * @param {(detail:{uploadedBytes:number,totalBytes:number})=>void} [opts.onDetail]
 *        callback riche : octets réellement envoyés / taille totale → l'UI en
 *        déduit %, taille "2.3 Go / 5.1 Go", vitesse et temps restant.
 * @param {AbortSignal} [opts.signal] - permet le bouton "Annuler".
 * @returns {Promise<string>} URL publique du fichier
 */
export async function uploadChunked(file, onProgress, opts = {}) {
  // Accepte aussi la forme uploadChunked(file, { onProgress, onDetail, signal }).
  const onDetail = typeof onProgress === "object" ? onProgress.onDetail : opts.onDetail;
  const pctCb = typeof onProgress === "function" ? onProgress : (typeof onProgress === "object" ? onProgress.onProgress : undefined);
  const signal = (typeof onProgress === "object" ? onProgress.signal : undefined) ?? opts.signal;

  // 1. Ouverture de la session d'upload (id déterministe = reprise auto après
  //    rechargement de page si le même fichier est sélectionné à nouveau).
  const sessionId = btoa(`${file.name}:${file.size}:${file.lastModified}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);

  const fnUrl = `${SERVER_BASE}/api/functions/upload_chunk`;

  const init = await postWithRetry(fnUrl, JSON.stringify({ action: "init", session_id: sessionId, name: file.name, size: file.size }), {
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (init?.error) throw new Error(init.error);

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploaded = new Set(Array.isArray(init?.uploaded) ? init.uploaded : []);

  // Progression en OCTETS (plus précis que par chunk : le dernier chunk est
  // partiel, et les chunks déjà présents côté serveur sont comptés d'office).
  let uploadedBytes = 0;
  for (const i of uploaded) {
    uploadedBytes += Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
  }
  const report = () => {
    pctCb?.(Math.round((uploadedBytes / file.size) * 95));
    onDetail?.({ uploadedBytes, totalBytes: file.size });
  };
  report();

  // 2. Envoi morceau par morceau (les morceaux déjà présents côté serveur sont
  //    sautés → reprise après coupure sans renvoyer tout le fichier).
  for (let i = 0; i < totalChunks; i++) {
    if (uploaded.has(i)) continue;
    const end = Math.min(file.size, (i + 1) * CHUNK_SIZE);
    const blob = file.slice(i * CHUNK_SIZE, end);
    const fd = new FormData();
    fd.append("action", "chunk");
    fd.append("session_id", sessionId);
    fd.append("index", String(i));
    fd.append("total", String(totalChunks));
    fd.append("name", file.name);
    fd.append("chunk", blob, `${sessionId}_${i}`);
    // Timeout adapté à la taille du morceau (~60 s minimum, + 1 s/Mo envoyé).
    const res = await postWithRetry(fnUrl, fd, {
      timeoutMs: Math.max(60_000, (blob.size / (1024 * 1024)) * 1000 + 30_000),
      signal,
    });
    if (res?.error) throw new Error(res.error);
    uploaded.add(i);
    uploadedBytes += blob.size;
    report();
  }

  // 3. Assemblage côté serveur + publication via le stockage public officiel.
  pctCb?.(97);
  const fin = await postWithRetry(fnUrl, JSON.stringify({ action: "finalize", session_id: sessionId, name: file.name }), {
    headers: { "Content-Type": "application/json" },
    // L'assemblage télécharge puis recolle tous les morceaux : dimensionné
    // dynamiquement pour supporter des fichiers très volumineux (Go).
    timeoutMs: Math.max(300_000, (file.size / (1024 * 1024)) * 400),
    signal,
  });
  if (fin?.error) throw new Error(fin.error);
  const url = pickUrl(fin);
  if (!url) throw new Error("Upload terminé mais aucune URL reçue (" + JSON.stringify(fin)?.slice(0, 120) + ")");
  pctCb?.(100);
  return url;
}

/** Point d'entrée unique utilisé par toute l'app. Bascule auto direct/chunké. */
export async function uploadToBase44(file, { forceChunked = false, onProgress, onDetail, signal } = {}) {
  if (!appParams.appId) {
    throw new Error(
      "Configuration manquante : VITE_BASE44_APP_ID est vide → le backend reçoit app_id=None et rejette l'upload. Renseignez-le (base44 link / .env.local)."
    );
  }
  if (!forceChunked && file.size <= SEUIL_UPLOAD_DIRECT) {
    return directUpload(file);
  }
  return uploadChunked(file, { onProgress, onDetail, signal });
}
