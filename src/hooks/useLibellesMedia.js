import { useEffect, useReducer } from "react";
import { base44 } from "@/api/base44Client";

// Noms des sections du multimédia choisis par l'admin (Radio, Musique, Prédications…), vus par tous les membres.
// Rangés dans MediaOrder (déjà en place depuis la 1.3.9), ligne « libelles:sections », champ `ids` = { id: nom }.
// Un nom vide ou absent : le nom d'origine (src/lib/mediaConstants.js).
export const CLE_LIBELLES = "libelles:sections";
const MAX = 40;

let libelles = {};
let ligneId = null;
let chargement = null;
const abonnes = new Set();
const prevenir = () => abonnes.forEach((f) => f());

/** Garde seulement des noms propres : texte, sans espaces en trop, 40 caractères au plus. */
export function nettoyerLibelles(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [id, nom] of Object.entries(v)) {
    const propre = typeof nom === "string" ? nom.replace(/\s+/g, " ").trim().slice(0, MAX) : "";
    if (/^[a-z0-9_-]{1,30}$/.test(id) && propre) out[id] = propre;
  }
  return out;
}

function charger() {
  if (!chargement) {
    chargement = base44.entities.MediaOrder.filter({ key: CLE_LIBELLES }, "-created_date", 1)
      .then((rows) => {
        const r = Array.isArray(rows) ? rows[0] : null;
        ligneId = r?.id || null;
        libelles = nettoyerLibelles(r?.ids);
      })
      .catch(() => {})
      .finally(prevenir);
  }
  return chargement;
}

/** { id: nom } choisi par l'admin. */
export function useLibellesMedia() {
  const [, rafraichir] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    abonnes.add(rafraichir);
    charger();
    return () => abonnes.delete(rafraichir);
  }, []);
  return libelles;
}

/** Admin : nouveau nom d'une section (vide = nom d'origine). Lève une erreur lisible. */
export async function enregistrerLibelle(id, nom) {
  await charger();
  const avant = libelles;
  const suivant = { ...libelles };
  const propre = String(nom || "").replace(/\s+/g, " ").trim().slice(0, MAX);
  if (propre) suivant[id] = propre; else delete suivant[id];
  libelles = suivant;
  prevenir();
  try {
    const rec = ligneId
      ? await base44.entities.MediaOrder.update(ligneId, { ids: suivant })
      : await base44.entities.MediaOrder.create({ key: CLE_LIBELLES, ids: suivant });
    if (rec?.id) ligneId = rec.id;
  } catch (err) {
    libelles = avant;
    prevenir();
    throw new Error(`Nom non enregistré : ${err?.message || err}`);
  }
}
