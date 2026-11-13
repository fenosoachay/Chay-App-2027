import { useEffect, useReducer } from "react";
import { base44 } from "@/api/base44Client";
import { nettoyerIds, ordresParCle } from "@/lib/ordreMedia";

// Ordres partagés du multimédia (collection MediaOrder) : chargés une fois par session (quelques lignes), gardés en
// mémoire et mis à jour tout de suite après un enregistrement de l'admin. Avant la migration 1.3.9 (collection
// absente), aucun ordre : l'affichage reste celui d'avant.
let ordres = new Map();
let lignes = new Map(); // clé -> id de la ligne MediaOrder
let chargement = null;
const abonnes = new Set();
const prevenir = () => abonnes.forEach((f) => f());
const VIDE = Object.freeze([]); // même référence à chaque rendu (pas de recalcul ni de boucle d'effets)

function charger() {
  if (!chargement) {
    chargement = base44.entities.MediaOrder.list("-created_date", 500)
      .then((rows) => {
        ordres = ordresParCle(rows);
        lignes = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.key, r.id]));
      })
      .catch(() => {})
      .finally(prevenir);
  }
  return chargement;
}

/** Ordre enregistré d'une liste (tableau d'ids, vide si aucun). */
export function useOrdreMedia(cle) {
  const [, rafraichir] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    abonnes.add(rafraichir);
    charger();
    return () => abonnes.delete(rafraichir);
  }, []);
  return ordres.get(cle) || VIDE;
}

/** Admin : enregistre l'ordre d'une liste (création ou mise à jour de sa ligne). Lève une erreur lisible. */
export async function enregistrerOrdreMedia(cle, ids) {
  await charger();
  const propres = nettoyerIds(ids);
  const avant = ordres.get(cle);
  ordres = new Map(ordres).set(cle, propres);
  prevenir();
  try {
    const id = lignes.get(cle);
    const rec = id
      ? await base44.entities.MediaOrder.update(id, { ids: propres })
      : await base44.entities.MediaOrder.create({ key: cle, ids: propres });
    if (rec?.id) lignes.set(cle, rec.id);
  } catch (err) {
    ordres = new Map(ordres);
    if (avant) ordres.set(cle, avant); else ordres.delete(cle);
    prevenir();
    const absente = err?.status === 404 || /missing collection|not found/i.test(String(err?.message || ""));
    throw new Error(absente ? "Ordre non enregistré : collection MediaOrder absente (migration 1.3.9 à appliquer)." : `Ordre non enregistré : ${err?.message || err}`);
  }
}

/** Tests : remet le cache à zéro. */
export function _reinitialiserOrdresMedia() {
  ordres = new Map();
  lignes = new Map();
  chargement = null;
}

/** Tous les ordres (lecture par clé), pour un écran qui affiche plusieurs listes (gestion YouTube). */
export function useOrdresMedia() {
  const [, rafraichir] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    abonnes.add(rafraichir);
    charger();
    return () => abonnes.delete(rafraichir);
  }, []);
  return (cle) => ordres.get(cle) || VIDE;
}
