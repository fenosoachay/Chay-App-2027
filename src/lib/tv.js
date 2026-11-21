// Diffusion sur TV (1.3.23) : Samsung, LG, Hisense VIDAA et la plupart des TV connectées (DLNA).
// Le téléphone envoie le média à la TV par son propre relais, puis sert de télécommande (ChayTvPlugin.java).
// État partagé : la télécommande (TelecommandeTv) s'affiche tant qu'une diffusion est en cours.
import { ChayTv, estNatif } from "@/lib/chayConversation";

let etat = null; // { nom, titre, video, direct, etat, position, duree }
const ecouteurs = new Set();
let suivi = null;
let arretDepuis = 0;

function publier(e) {
  etat = e;
  ecouteurs.forEach((f) => f(e));
}

export function subscribeTv(f) {
  ecouteurs.add(f);
  f(etat);
  return () => ecouteurs.delete(f);
}

export const tvDisponible = () => estNatif();

/** Message d'erreur du plugin, lisible. */
export const messageTv = (e, defaut) => (typeof e?.message === "string" && e.message) || defaut;

function arreterSuivi() {
  if (suivi) clearInterval(suivi);
  suivi = null;
}

function demarrerSuivi() {
  arreterSuivi();
  arretDepuis = 0;
  let aJoue = false;
  suivi = setInterval(async () => {
    try {
      const r = await ChayTv.etat();
      if (!r?.actif) { arreterSuivi(); publier(null); return; }
      if (r.etat === "PLAYING") aJoue = true;
      // Fin du média sur la TV (arrêtée depuis plus de 6 s après avoir joué) : la diffusion se termine.
      if (aJoue && (r.etat === "STOPPED" || r.etat === "NO_MEDIA_PRESENT")) {
        arretDepuis = arretDepuis || Date.now();
        if (Date.now() - arretDepuis > 6000) { arreterTv(); return; }
      } else arretDepuis = 0;
      if (etat) publier({ ...etat, etat: r.etat, position: r.position >= 0 ? r.position : etat.position, duree: r.duree > 0 ? r.duree : etat.duree });
    } catch {
      /* TV momentanément injoignable : on réessaie */
    }
  }, 1000);
}

if (estNatif()) {
  try {
    ChayTv.addListener("fin", () => { arreterSuivi(); publier(null); });
  } catch {
    /* plugin absent (ancienne version) */
  }
}

export async function chercherTv() {
  const r = await ChayTv.chercher();
  return Array.isArray(r?.appareils) ? r.appareils : [];
}

/** media : { url, titre, video, position, direct } */
export async function envoyerSurTv(appareil, media) {
  await ChayTv.lancer({
    id: appareil.id,
    url: media.url,
    titre: media.titre || "Chay",
    video: Boolean(media.video),
    direct: Boolean(media.direct),
    position: Number(media.position) || 0,
  });
  publier({ nom: appareil.nom, titre: media.titre || "Chay", video: Boolean(media.video), direct: Boolean(media.direct), etat: "TRANSITIONING", position: Number(media.position) || 0, duree: 0 });
  demarrerSuivi();
}

export async function commandeTv(action, position) {
  await ChayTv.commande({ action, position: Number(position) || 0 });
  if (etat && (action === "pause" || action === "reprendre")) publier({ ...etat, etat: action === "pause" ? "PAUSED_PLAYBACK" : "PLAYING" });
  if (etat && action === "aller") publier({ ...etat, position: Number(position) || 0 });
}

export async function volumeTv(delta) {
  const r = await ChayTv.volume({ delta });
  return r?.volume;
}

export async function arreterTv() {
  arreterSuivi();
  publier(null);
  try {
    await ChayTv.commande({ action: "arreter" });
  } catch {
    /* déjà arrêtée */
  }
}

/** « 1:02:03 » ou « 2:05 ». */
export function duree(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = String(n % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
