// 1.4.1 : « Coup de cœur de ce mois » (accueil, sous le verset du jour ; collection CoupDeCoeur).
// Règles d'affichage et petits calculs, sans dépendance (testés : coupDeCoeur.test.js).

const JOUR = 24 * 3600 * 1000;

/** Durées proposées dans l'admin (jours ; 0 = toujours). « Autre » : nombre de jours au choix. */
export const DUREES = [
  { jours: 1, label: "1 jour" },
  { jours: 2, label: "2 jours" },
  { jours: 3, label: "3 jours" },
  { jours: 7, label: "1 semaine" },
  { jours: 14, label: "2 semaines" },
  { jours: 30, label: "1 mois" },
  { jours: 0, label: "Toujours" },
];

const ms = (d) => {
  if (!d) return NaN;
  const t = Date.parse(String(d).replace(" ", "T"));
  return Number.isFinite(t) ? t : NaN;
};

/** Fin d'affichage (ms), ou null si « toujours » ; NaN si la date de début est illisible. */
export function finAffichage(c) {
  const jours = Math.max(0, Math.floor(Number(c?.duree_jours) || 0));
  if (!jours) return null;
  const debut = ms(c?.debut);
  return Number.isFinite(debut) ? debut + jours * JOUR : NaN;
}

/** Le coup de cœur est-il affiché maintenant ? (actif, commencé, pas terminé). */
export function estAffiche(c, maintenant = Date.now()) {
  if (!c || !c.actif || !c.audio_url) return false;
  const debut = ms(c.debut);
  if (Number.isFinite(debut) && debut > maintenant) return false;
  const fin = finAffichage(c);
  if (fin === null) return true;
  return Number.isFinite(fin) && maintenant < fin;
}

/** Celui à montrer : le plus récent affiché (le serveur n'a renvoyé que ceux que le membre peut voir). */
export function choisirCoupDeCoeur(liste, maintenant = Date.now()) {
  const affiches = (liste || []).filter((c) => estAffiche(c, maintenant));
  affiches.sort((a, b) => (ms(b.debut) || 0) - (ms(a.debut) || 0));
  return affiches[0] || null;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « Coup de cœur de novembre », « Coup de cœur d'avril », « Coup de cœur d'août ». */
export function titreDuMois(date = new Date()) {
  const m = MOIS[date.getMonth()];
  return `Coup de cœur ${/^[aeiouyéè]/i.test(m) ? "d'" : "de "}${m}`;
}

/** État lisible dans l'admin. */
export function etatAdmin(c, maintenant = Date.now()) {
  if (!c?.actif) return { cle: "retire", texte: "Retiré" };
  const debut = ms(c.debut);
  if (Number.isFinite(debut) && debut > maintenant) return { cle: "programme", texte: "Programmé" };
  const fin = finAffichage(c);
  if (fin === null) return { cle: "affiche", texte: "Affiché · toujours" };
  if (!Number.isFinite(fin) || maintenant >= fin) return { cle: "termine", texte: "Terminé" };
  const d = new Date(fin);
  return { cle: "affiche", texte: `Affiché jusqu'au ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` };
}

/** Hauteurs (0..1) des barres de l'onde, toujours les mêmes pour un même chant. */
export function onde(graine, n = 46) {
  let h = 2166136261;
  for (const ch of String(graine || "chay")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ i;
    const r = ((h >>> 0) % 1000) / 1000;
    const enveloppe = 0.55 + 0.45 * Math.sin((i / (n - 1)) * Math.PI);
    out.push(Math.max(0.18, Math.min(1, (0.35 + 0.65 * r) * enveloppe)));
  }
  return out;
}

/** « 1:05 », « 12:30 ». */
export function minutes(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Piste du lecteur global : la musique liée garde son identifiant (ses écoutes comptent pour le classement). */
export function pisteDe(c) {
  return {
    id: c.track_id || `coup-de-coeur-${c.id}`,
    title: c.title,
    artist: c.artist,
    audio_url: c.audio_url,
    cover_url: "", // novembre 2026 : plus de pochette
    mediaType: "music",
    discret: true, // lecture depuis la carte : pas de plein écran, la carte affiche l'avancement
    route: "/",
    ...(c.track_id ? { vue: { type: "piste", id: c.track_id } } : {}),
  };
}
