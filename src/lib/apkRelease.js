// Application Android : adresse STABLE de l'APK (le fichier est remplacé à chaque version) et description de la
// dernière version publiée (latest.json, écrit par pocketbase/scripts/publier-apk.mjs). Aucune dépendance à GitHub.
// Le bouton de téléchargement ne dépend jamais de latest.json : si sa lecture échoue, seule l'information de version
// manque.

export const APK_URL = "https://membres.chay.fr/telechargements/chay.apk";
export const LATEST_URL = "https://membres.chay.fr/telechargements/latest.json";

/**
 * Valide le contenu de latest.json. Renvoie { versionName, versionCode, date, tailleMo } ou null.
 * versionName et versionCode sont obligatoires ; date et tailleMo sont facultatifs (null s'ils sont invalides).
 */
export function parseLatest(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const versionName = typeof data.versionName === "string" ? data.versionName.trim() : "";
  const versionCode = Number(data.versionCode);
  if (!/^\d+(\.\d+){0,3}$/.test(versionName)) return null;
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) return null;
  const d = typeof data.date === "string" ? new Date(data.date) : null;
  const tailleMo = Number(data.tailleMo);
  return {
    versionName,
    versionCode,
    date: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    tailleMo: Number.isFinite(tailleMo) && tailleMo > 0 && tailleMo < 10000 ? tailleMo : null,
  };
}

/**
 * Lit latest.json. Ne lève JAMAIS d'erreur : renvoie null en cas d'échec réseau, de délai dépassé, de réponse
 * non 200 ou de contenu invalide.
 */
export async function fetchLatest({ fetchImpl = globalThis.fetch, url = LATEST_URL, timeoutMs = 5000 } = {}) {
  if (typeof fetchImpl !== "function") return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, { cache: "no-store", signal: controller?.signal });
    if (!res || !res.ok) return null;
    return parseLatest(await res.json());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** « 12 nov. 2026 » ; null si la date est absente. */
export function formatDate(iso, locale = "fr-FR") {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** « Version 1.3 · 12 nov. 2026 · 25,4 Mo » (les parties absentes sont omises). */
export function describeLatest(latest, locale = "fr-FR") {
  if (!latest) return null;
  const parts = [`Version ${latest.versionName}`];
  const date = formatDate(latest.date, locale);
  if (date) parts.push(date);
  // 1.3.40 : tailleMo de latest.json (publier-membres.ps1) est en Mio (octets / 1 048 576) ; affichée en Mo
  // décimaux, comme le gestionnaire de fichiers d'Android (26,9 Mio = 28,2 Mo).
  if (latest.tailleMo) parts.push(`${((latest.tailleMo * 1048576) / 1e6).toLocaleString(locale, { maximumFractionDigits: 1 })} Mo`);
  return parts.join(" · ");
}

/**
 * Compare la version installée (APK : { version, build } de @capacitor/app ; navigateur : null) à la dernière.
 * @returns {{ etat: "inconnue" | "a-jour" | "nouvelle" | "disponible", message: string | null }}
 */
export function compareInstalled(latest, installed) {
  if (!latest) return { etat: "inconnue", message: null };
  const build = Number(installed?.build);
  if (!installed || !Number.isSafeInteger(build) || build < 1) {
    return { etat: "disponible", message: `Dernière version : ${latest.versionName}` };
  }
  if (build >= latest.versionCode) {
    return { etat: "a-jour", message: `Vous avez la dernière version (${installed.version || latest.versionName})` };
  }
  return {
    etat: "nouvelle",
    message: `Nouvelle version disponible : ${latest.versionName}${installed.version ? ` (vous avez la ${installed.version})` : ""}`,
  };
}
