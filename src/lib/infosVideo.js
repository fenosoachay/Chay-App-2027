// Format et durée d'une vidéo, lus dans le fichier lui-même (1.3.23) : c'est la vidéo qui décide,
// pas la playlist. 16:9 (paysage) -> lecteur film ; 9:16 (portrait) -> plein écran vertical façon TikTok.
// Lecture des seules métadonnées (quelques Ko), 3 à la fois ; résultat gardé sur le téléphone.
import { useEffect, useState } from "react";

const CLE = "chay_infos_video";
const MAX_GARDEES = 500;
const memoire = new Map(); // url -> { portrait, duree }
const enCours = new Map(); // url -> Promise
const attente = [];
let actifs = 0;

/** Vrai si l'image est plus haute que large (9:16, 3:4…). */
export function estPortrait(largeur, hauteur) {
  return Number(hauteur) > 0 && Number(largeur) > 0 && Number(hauteur) > Number(largeur);
}

/** « 108m », « 4m », « 45s » ; vide si inconnue. */
export function formatDuree(secondes) {
  const s = Number(secondes);
  if (!Number.isFinite(s) || s <= 0) return "";
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

function charger() {
  if (memoire.size) return;
  try {
    const brut = JSON.parse(globalThis.localStorage?.getItem(CLE) || "{}");
    for (const [url, v] of Object.entries(brut)) {
      if (v && typeof v.portrait === "boolean") memoire.set(url, { portrait: v.portrait, duree: Number(v.duree) || 0 });
    }
  } catch {
    /* stockage indisponible : on relira les vidéos */
  }
}

function garder() {
  try {
    const entrees = [...memoire.entries()].slice(-MAX_GARDEES);
    globalThis.localStorage?.setItem(CLE, JSON.stringify(Object.fromEntries(entrees)));
  } catch {
    /* stockage plein ou bloqué : tant pis, la mémoire de la session suffit */
  }
}

/** Infos déjà connues (sans rien charger). */
export function infosConnues(url) {
  if (!url) return null;
  charger();
  return memoire.get(url) || null;
}

function suivant() {
  while (actifs < 3 && attente.length) {
    const tache = attente.shift();
    actifs += 1;
    tache().finally(() => { actifs -= 1; suivant(); });
  }
}

function sonder(url) {
  return new Promise((resolve) => {
    const doc = globalThis.document;
    if (!doc) { resolve(null); return; }
    const v = doc.createElement("video");
    let fini = false;
    const terminer = (r) => {
      if (fini) return;
      fini = true;
      clearTimeout(delai);
      v.removeAttribute("src");
      try { v.load(); } catch { /* rien */ }
      resolve(r);
    };
    const delai = setTimeout(() => terminer(null), 10000);
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => terminer({
      portrait: estPortrait(v.videoWidth, v.videoHeight),
      duree: Number.isFinite(v.duration) ? Math.round(v.duration) : 0,
    });
    v.onerror = () => terminer(null);
    v.src = url;
  });
}

/** Infos d'une vidéo (lecture des métadonnées si besoin) ; null si illisible. */
export function infosVideo(url) {
  const connues = infosConnues(url);
  if (connues) return Promise.resolve(connues);
  if (!url) return Promise.resolve(null);
  if (enCours.has(url)) return enCours.get(url);
  const p = new Promise((resolve) => {
    attente.push(() => sonder(url).then((r) => {
      enCours.delete(url);
      if (r) { memoire.set(url, r); garder(); }
      resolve(r);
    }));
    suivant();
  });
  enCours.set(url, p);
  return p;
}

/** Hook : { portrait, duree } dès qu'ils sont connus, sinon null. */
export function useInfosVideo(url) {
  const [infos, setInfos] = useState(() => infosConnues(url));
  useEffect(() => {
    let vivant = true;
    setInfos(infosConnues(url));
    infosVideo(url).then((r) => { if (vivant && r) setInfos(r); });
    return () => { vivant = false; };
  }, [url]);
  return infos;
}
