// Taille de police de l'app, réglée par chaque membre (Paramètres > Affichage) et enregistrée SUR L'APPAREIL
// (localStorage, jamais envoyée au serveur). Appliquée à la racine (font-size de <html>) : tout ce qui est en
// rem (textes, marges, boutons) suit. Le même calcul est fait avant le premier rendu par index.html (anti-saut).

export const CLE_TAILLE_POLICE = "chay-taille-police"; // synchronisée avec le script de index.html
export const TAILLES_POLICE = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150];
/** À partir de cette taille, les titres et textes tronqués passent à la ligne (styles de src/index.css). */
export const SEUIL_GRANDE_POLICE = 150;

/** Taille retenue : un palier de 5 entre 100 et 150 (une ancienne taille 175 ou 200 devient 150). */
export function normaliserTaille(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 100) return 100;
  if (n >= 150) return 150;
  return Math.round(n / 5) * 5;
}

export function lireTaillePolice(storage = globalThis.localStorage) {
  try {
    return normaliserTaille(storage?.getItem(CLE_TAILLE_POLICE));
  } catch {
    return 100;
  }
}

/** Applique la taille (document de l'app) ; renvoie la valeur retenue. */
export function appliquerTaillePolice(v, doc = globalThis.document) {
  const t = normaliserTaille(v);
  const html = doc?.documentElement;
  if (!html) return t;
  // Base réduite sur écran étroit (html de src/index.css), multipliée par la taille choisie.
  html.style.fontSize = t === 100 ? "" : `calc(var(--chay-base, 16px) * ${t / 100})`;
  // Les boutons annulent cet agrandissement (src/index.css) : ils gardent leur taille.
  if (t === 100) html.style.removeProperty?.("--chay-zoom");
  else html.style.setProperty?.("--chay-zoom", String(t / 100));
  html.dataset.police = String(t);
  if (t >= SEUIL_GRANDE_POLICE) html.dataset.policeGrande = "";
  else delete html.dataset.policeGrande;
  return t;
}

export function enregistrerTaillePolice(v, storage = globalThis.localStorage, doc = globalThis.document) {
  const t = appliquerTaillePolice(v, doc);
  try {
    storage?.setItem(CLE_TAILLE_POLICE, String(t));
  } catch {
    /* stockage indisponible : réglage appliqué pour cette session seulement */
  }
  return t;
}
