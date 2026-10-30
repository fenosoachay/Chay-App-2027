import { base44 } from "@/api/base44Client";

// ─── Helper : extrait le message d'erreur clair du serveur ──────────────────
function _extractErrorMessage(error, fallback = "Une erreur est survenue.") {
  if (!error) return fallback;
  // Cherche le message à différents endroits possibles selon le SDK
  const serverMsg =
    error?.data?.error ||
    error?.response?.data?.error ||
    error?.body?.error ||
    error?.error ||
    error?.message;
  if (serverMsg && typeof serverMsg === "string" && !serverMsg.includes("status code")) {
    return serverMsg;
  }
  return fallback;
}

async function _invoke(name, args) {
  try {
    const res = await base44.functions.invoke(name, args || {});
    if (res?.data?.error) {
      throw new Error(res.data.error);
    }
    return res?.data || {};
  } catch (raw) {
    const msg = _extractErrorMessage(raw);
    throw new Error(msg);
  }
}

// ─── Demandes de thème ───────────────────────────────────────────────────────

export async function createThemeRequest({ theme, passage }) {
  return _invoke("createThemeRequest", { theme, passage });
}

export async function handleThemeRequest({ request_id, decision, admin_note }) {
  return _invoke("handleThemeRequest", { request_id, decision, admin_note });
}

export async function fetchMyThemeRequests(userId, limit = 50) {
  if (!userId) return [];
  const rows = await base44.entities.ThemeRequest.filter(
    { user_id: userId },
    "-created_date",
    limit
  );
  return Array.isArray(rows) ? rows : [];
}

export async function fetchAdminThemeRequests(status = null, limit = 200) {
  const filter = status ? { status } : {};
  const rows = await base44.entities.ThemeRequest.filter(filter, "-created_date", limit);
  return Array.isArray(rows) ? rows : [];
}

// ─── Prières ─────────────────────────────────────────────────────────────────

export async function createPrayerRequest({ category, content }) {
  return _invoke("createPrayerRequest", { category, content });
}

export async function fetchPrayerWall() {
  return _invoke("getPrayerWall", {}).then((data) => data?.items || []);
}

export async function takePrayer(prayerId) {
  return _invoke("takePrayer", { prayer_id: prayerId });
}

export async function answerPrayer(prayerId) {
  return _invoke("answerPrayer", { prayer_id: prayerId });
}

export async function fetchMyPrayerRequests(userId, limit = 100) {
  if (!userId) return [];
  const rows = await base44.entities.PrayerRequest.filter(
    { requester_id: userId },
    "-created_date",
    limit
  );
  return Array.isArray(rows) ? rows : [];
}

export async function fetchPrayersITakeCharge(userId, limit = 100) {
  if (!userId) return [];
  const rows = await base44.entities.PrayerRequest.filter(
    { taken_by: userId },
    "-taken_date",
    limit
  );
  return Array.isArray(rows) ? rows : [];
}

// ─── Vérification admin désigné (frontend) ──────────────────────────────────
export async function isDesignatedAdminFrontend(base44Client, userId) {
  if (!userId) return false;
  try {
    const me = await base44Client.entities.User.get(userId);
    if (!me || me.role !== "admin") return false;
    const firstAdmins = await base44Client.entities.User.list("created_date", 1);
    const firstAdminId = Array.isArray(firstAdmins) && firstAdmins[0] ? String(firstAdmins[0].id) : null;
    return Boolean(firstAdminId) && firstAdminId !== String(userId);
  } catch {
    return false;
  }
}

// ─── Labels et styles de statut ──────────────────────────────────────────────

export const THEME_STATUS_LABEL = {
  pending: "En attente",
  validated: "Validée",
  declined: "Non retenue",
};

export const THEME_STATUS_STYLE = {
  pending: "bg-secondary/10 text-secondary",
  validated: "bg-primary/10 text-primary",
  declined: "bg-muted text-muted-foreground",
};

export const PRAYER_STATUS_LABEL = {
  open: "Ouverte",
  taken: "Prise en charge",
  answered: "Exaucée",
};

export const PRAYER_STATUS_STYLE = {
  open: "bg-secondary/10 text-secondary",
  taken: "bg-primary/10 text-primary",
  answered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export const PRAYER_CATEGORIES = ["Santé", "Famille", "Travail", "Guidance", "Autre"];

// ─── Utilitaire de date relative en français ─────────────────────────────────
export function timeAgo(isoDate) {
  if (!isoDate) return "";
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHeure = Math.floor(diffMin / 60);
  const diffJour = Math.floor(diffHeure / 24);

  if (diffSec < 60) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffHeure < 24) return `il y a ${diffHeure} h`;
  if (diffJour < 7) return `il y a ${diffJour} j`;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
