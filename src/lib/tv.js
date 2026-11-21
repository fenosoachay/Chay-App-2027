// Diffusion sur TV (1.3.23) : Samsung, LG, Hisense VIDAA et la plupart des TV connectées (DLNA).
// Le téléphone envoie le média à la TV par son propre relais, puis sert de télécommande (ChayTvPlugin.java).
// État partagé : la télécommande (TelecommandeTv) s'affiche tant qu'une diffusion est en cours.
import { ChayTv, estNatif } from "@/lib/chayConversation";

let etat = null; // { nom, titre, video, direct, etat, position, duree }
const ecouteurs = new Set();
let suivi = null;
let arretDepuis = 0;
// Horloge du téléphone : certaines TV (Hisense VIDAA) renvoient une position fausse (ex. 18220 h) ou pas de durée.
// On compte donc nous-mêmes le temps écoulé, et on ne croit la TV que si sa position est plausible.
let horloge = { base: 0, depuis: 0, joue: false };
const MAX_PLAUSIBLE = 12 * 3600;

function regler(position, joue) {
  horloge = { base: Math.max(0, Number(position) || 0), depuis: Date.now(), joue };
}

function estimer() {
  return horloge.base + (horloge.joue ? (Date.now() - horloge.depuis) / 1000 : 0);
}

function plausible(position, duree) {
  if (!(position >= 0) || position > MAX_PLAUSIBLE) return false;
  return !(duree > 0) || position <= duree + 30;
}

// Hisense : « 18220:09:46 » = heures fausses, mais minutes:secondes justes (vu à l'écran de la TV).
// On garde mm:ss de la TV et on prend l'heure la plus proche de notre estimation (écart < 30 min).
function corriger(position, duree) {
  if (plausible(position, duree)) return position;
  if (!(position >= 0) || !Number.isFinite(position)) return -1;
  const mmss = position % 3600;
  const est = estimer();
  const c = Math.round((est - mmss) / 3600) * 3600 + mmss;
  return c >= 0 && Math.abs(c - est) < 1800 && plausible(c, duree) ? c : -1;
}

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
      if (!etat) return;
      const joue = r.etat === "PLAYING";
      const dureeTv = r.duree > 0 && r.duree <= MAX_PLAUSIBLE ? r.duree : 0;
      const duree = etat.duree > 0 ? etat.duree : dureeTv;
      const vraie = corriger(r.position, duree);
      if (vraie >= 0) regler(vraie, joue);
      else if (joue !== horloge.joue) regler(estimer(), joue);
      const position = duree > 0 ? Math.min(estimer(), duree) : estimer();
      publier({ ...etat, etat: r.etat, position, duree });
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

/** media : { url, titre, video, position, direct, duree } (duree : celle connue du lecteur du téléphone) */
export async function envoyerSurTv(appareil, media) {
  await ChayTv.lancer({
    id: appareil.id,
    url: media.url,
    titre: media.titre || "Chay",
    video: Boolean(media.video),
    direct: Boolean(media.direct),
    position: Number(media.position) || 0,
  });
  const duree = Number(media.duree) > 0 && Number.isFinite(Number(media.duree)) ? Number(media.duree) : 0;
  regler(media.position, false);
  publier({ nom: appareil.nom, titre: media.titre || "Chay", video: Boolean(media.video), direct: Boolean(media.direct), etat: "TRANSITIONING", position: Number(media.position) || 0, duree });
  demarrerSuivi();
}

export async function commandeTv(action, position) {
  await ChayTv.commande({ action, position: Number(position) || 0 });
  if (etat && (action === "pause" || action === "reprendre")) {
    regler(estimer(), action === "reprendre");
    publier({ ...etat, etat: action === "pause" ? "PAUSED_PLAYBACK" : "PLAYING", position: estimer() });
  }
  if (etat && action === "aller") {
    regler(position, horloge.joue);
    publier({ ...etat, position: Number(position) || 0 });
  }
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
