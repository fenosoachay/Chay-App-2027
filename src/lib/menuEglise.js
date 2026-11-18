// Menu ☰ de l'en-tête : « Histoire de l'Église », « Personnel », Vision, But, Confession (collections ChurchHistory, StaffMember, PageTexte).

import { History, Users, Target, Flag, ScrollText } from "lucide-react";

export const ENTREES_MENU_EGLISE = [
  { to: "/eglise/histoire", label: "Histoire de l'Église", icon: History },
  { to: "/eglise/vision", label: "Vision de l'Église", icon: Target },
  { to: "/eglise/but", label: "But de l'Église", icon: Flag },
  { to: "/eglise/confession", label: "Confession de foi", icon: ScrollText },
  { to: "/eglise/personnel", label: "Personnel", icon: Users },
];

/** Photos de la fiche « Histoire » : tableau d'URL http(s), dans l'ordre de l'admin. */
export function photosHistoire(fiche) {
  const p = fiche?.photos;
  return (Array.isArray(p) ? p : []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
}

/** Personnel dans l'ordre choisi par l'admin (`order`), puis par nom. */
export function trierPersonnel(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((p) => p && p.name)
    .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999) || String(a.name).localeCompare(String(b.name), "fr"));
}

/** Initiales (avatar sans photo). */
export function initiales(nom) {
  return String(nom || "?").trim().split(/\s+/).slice(0, 2).map((m) => m[0]?.toUpperCase() || "").join("") || "?";
}
