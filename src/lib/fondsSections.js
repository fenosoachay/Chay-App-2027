// Fonds plein écran des sections (1.3.35), dans l'esprit du widget « Verset du jour » (Nuit dorée), mais
// différents d'une section à l'autre. Chaque fond est animé (étoiles, ondes, aurore, chandelles…) par
// src/components/FondSection.jsx. Mode clair : une version « jour » des mêmes couleurs (textes lisibles) ;
// les pages déjà habillées en Nuit dorée (Sagesse en audio, Dictionnaire, Concordance, Jeux) restent de nuit.

export const FONDS = {
  accueil: {
    nom: "Aube dorée", decor: "aube",
    nuit: "radial-gradient(120% 60% at 50% 100%, #c98a2e 0%, #5b2f63 40%, transparent 70%), linear-gradient(180deg, #0C0E2C, #1E1448 60%, #3a1f3f)",
    jour: "radial-gradient(120% 55% at 50% 100%, #ffd98a 0%, #f6c9dc 45%, transparent 75%), linear-gradient(180deg, #fdf8ee, #f7edf4 60%, #fbe7d0)",
  },
  communaute: {
    nom: "Lanternes", decor: "lanternes",
    nuit: "radial-gradient(90% 50% at 50% 0%, rgba(140,70,160,0.35), transparent 70%), linear-gradient(180deg, #1a0f2e, #3B1C4E 60%, #120a20)",
    jour: "radial-gradient(90% 50% at 50% 0%, rgba(214,170,230,0.45), transparent 70%), linear-gradient(180deg, #fbf5fd, #f1e4f6 60%, #f8eefa)",
  },
  bible: {
    nom: "Parchemin de nuit", decor: "poussiere",
    nuit: "radial-gradient(90% 60% at 50% 20%, rgba(90,58,26,0.55), transparent), linear-gradient(180deg, #1b120a, #2c1d10 50%, #0d0905)",
    jour: "radial-gradient(90% 60% at 50% 20%, rgba(238,206,150,0.55), transparent), linear-gradient(180deg, #fcf6e8, #f4e8cc 50%, #faf1dc)",
  },
  sagesse: {
    nom: "Ondes", decor: "ondes", nuitToujours: true,
    nuit: "radial-gradient(70% 45% at 50% 30%, rgba(110,70,190,0.35), transparent 70%), linear-gradient(180deg, #120c38, #2E1A5C 60%, #0a0720)",
  },
  dictionnaire: {
    nom: "Bibliothèque", decor: "lettres", nuitToujours: true,
    nuit: "radial-gradient(80% 50% at 20% 0%, rgba(47,122,90,0.4), transparent), linear-gradient(180deg, #06231c, #0d3a2e 55%, #04140f)",
  },
  concordance: {
    nom: "Constellation", decor: "constellation", nuitToujours: true,
    nuit: "radial-gradient(100% 60% at 80% 0%, rgba(58,79,160,0.4), transparent), linear-gradient(180deg, #050a24, #0d1a45 60%, #03061a)",
  },
  multimedia: {
    nom: "Scène", decor: "scene",
    nuit: "linear-gradient(180deg, #2a0612, #4a0f22 55%, #14030a)",
    jour: "linear-gradient(180deg, #fdf2f4, #f7e0e7 55%, #fbeef1)",
  },
  multimediaDesign1: {
    nom: "Scène Classique", decor: "scene",
    nuit: "linear-gradient(180deg, #2a0612, #4a0f22 55%, #14030a)",
    jour: "linear-gradient(180deg, #fdf2f4, #f7e0e7 55%, #fbeef1)",
  },
  multimediaDesign2: {
    nom: "Vinyle Nuit", decor: "vinyle",
    nuit: "radial-gradient(ellipse at center, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)",
    jour: "radial-gradient(ellipse at center, #f5f0e8 0%, #e8dcc8 50%, #d4c4a8 100%)",
  },
  multimediaDesign3: {
    nom: "Aurore Sonore", decor: "aurore",
    nuit: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    jour: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 50%, #a8edea 100%)",
  },
  multimediaDesign4: {
    nom: "Spectrum Électrique", decor: "spectrum",
    nuit: "linear-gradient(90deg, #0d0d0d 0%, #1a0033 25%, #001a33 50%, #00331a 75%, #0d0d0d 100%)",
    jour: "linear-gradient(90deg, #f0f0f0 0%, #ffe0f0 25%, #e0f0ff 50%, #e0ffe0 75%, #f0f0f0 100%)",
  },
  multimediaDesign5: {
    nom: "Papier Vinyle", decor: "papier",
    nuit: "linear-gradient(180deg, #141414 0%, #1e1e1e 50%, #2a1a2a 100%)",
    jour: "linear-gradient(180deg, #faf8f5 0%, #f0ebe0 50%, #e8dfd0 100%)",
  },
  jeux: {
    nom: "Eaux profondes", decor: "eaux", nuitToujours: true,
    nuit: "radial-gradient(60% 40% at 50% 0%, rgba(96,214,255,0.25), transparent), linear-gradient(180deg, #0b3a5c, #072540 45%, #03101f)",
  },
  enfants: {
    nom: "Ciel de veillée", decor: "veillee",
    nuit: "linear-gradient(180deg, #1d2a6b, #3a3f9a 55%, #6a4fb0)",
    jour: "linear-gradient(180deg, #dcefff, #e7e6ff 55%, #f3e7ff)",
  },
  messages: {
    nom: "Aurore", decor: "aurore",
    nuit: "linear-gradient(180deg, #041a1f, #08303a 55%, #020c10)",
    jour: "linear-gradient(180deg, #effbf8, #e8f4f6 55%, #f1f0ff)",
  },
  requetes: {
    nom: "Chandelles", decor: "chandelles",
    nuit: "radial-gradient(80% 40% at 50% 100%, rgba(255,160,60,0.18), transparent 70%), linear-gradient(180deg, #120a05, #24140a 55%, #0a0603)",
    jour: "radial-gradient(80% 40% at 50% 100%, rgba(255,190,110,0.3), transparent 70%), linear-gradient(180deg, #fffaf2, #fbeedc 55%, #fff6ea)",
  },
  parametres: {
    nom: "Graphite doré", decor: "graphite",
    nuit: "linear-gradient(180deg, #16171c, #22232b 55%, #0e0f13)",
    jour: "linear-gradient(180deg, #f7f7f9, #ededf2 55%, #f5f5f8)",
  },
};

const VUES_BIBLE = { sagesse: "sagesse", dictionary: "dictionnaire", concordance: "concordance" };

/** Section (clé de FONDS) d'une adresse de l'appli, ou null (pas de fond : admin, jeux en cours, pages diverses). */
export function sectionDe(pathname, search = "") {
  const p = String(pathname || "/");
  const vue = new URLSearchParams(String(search || "")).get("view");
  if (p === "/") return "accueil";
  if (p === "/bible") return VUES_BIBLE[vue] || "bible";
  if (p === "/community" || p.startsWith("/profile/")) return "communaute";
  if (p === "/media") return "multimedia";
  if (p === "/games") return "jeux";
  if (p === "/kids") return "enfants";
  if (p === "/messages") return "messages";
  if (p === "/requests") return "requetes";
  if (p === "/settings" || p === "/notifications") return "parametres";
  return null;
}

/** Fond à peindre : { cle, fond, nuit } selon la section et le thème de l'appli (null : pas de fond). */
export function fondPour(cle, sombre) {
  const f = FONDS[cle];
  if (!f) return null;
  const nuit = Boolean(sombre || f.nuitToujours || !f.jour);
  return { cle, nom: f.nom, decor: f.decor, fond: nuit ? f.nuit : f.jour, nuit, force: Boolean(f.nuitToujours && !sombre) };
}
