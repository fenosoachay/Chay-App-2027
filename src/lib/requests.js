import { base44 } from "@/api/base44Client";

// ─── Demandes de thème ───────────────────────────────────────────────────────

export async function createThemeRequest({ theme, passage }) {
  const res = await base44.functions.invoke("createThemeRequest", { theme, passage });
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data || {};
}

export async function handleThemeRequest({ request_id, decision, admin_note }) {
  const res = await base44.functions.invoke("handleThemeRequest", { request_id, decision, admin_note });
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data || {};
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
  const res = await base44.functions.invoke("createPrayerRequest", { category, content });
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data || {};
}

export async function fetchPrayerWall() {
  const res = await base44.functions.invoke("getPrayerWall", {});
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data?.items || [];
}

export async function takePrayer(prayerId) {
  const res = await base44.functions.invoke("takePrayer", { prayer_id: prayerId });
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data || {};
}

export async function answerPrayer(prayerId) {
  const res = await base44.functions.invoke("answerPrayer", { prayer_id: prayerId });
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data || {};
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

// ─── Vérification admin désigné (frontend) ──────────────────────────────────
// Cache l'interface au créateur de l'application. La sécurité réelle est côté serveur.
export async function isDesignatedAdminFrontend(base44Client, userId) {
  if (!userId) return false;
  try {
    // Récupère l'utilisateur courant
    const me = await base44Client.entities.User.get(userId);
    if (!me || me.role !== "admin") return false;

    // Récupère le premier admin créé (le créateur de l'application)
    const firstAdmins = await base44Client.entities.User.list("created_date", 1);
    const firstAdminId = Array.isArray(firstAdmins) && firstAdmins[0] ? String(firstAdmins[0].id) : null;

    return Boolean(firstAdminId) && firstAdminId !== String(userId);
  } catch {
    return false;
  }
}
