export const YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";
export const YOUTUBE_REFERRER_POLICY = "origin";

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Identifiant YouTube (11 caractères) à partir d'un identifiant ou de n'importe quel lien YouTube :
 * watch?v=, youtu.be/, live/, shorts/, embed/, v/, m.youtube.com, music.youtube.com, avec ou sans ?si=… / &t=….
 * Renvoie "" si rien de valide (le lecteur affiche alors une erreur au lieu d'un écran noir).
 */
export function idYoutube(valeur) {
  const v = String(valeur || "").trim();
  if (ID_RE.test(v)) return v;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    const hote = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
    let id = "";
    if (hote === "youtu.be") id = u.pathname.split("/")[1] || "";
    else if (hote === "youtube.com" || hote === "youtube-nocookie.com") {
      id = u.searchParams.get("v") || "";
      if (!id) {
        const m = u.pathname.match(/^\/(?:embed|shorts|live|v|e)\/([^/?#]+)/);
        id = m ? m[1] : "";
      }
    }
    return ID_RE.test(id) ? id : "";
  } catch {
    return "";
  }
}

export function buildYouTubeEmbedUrl(videoId, pageOrigin) {
  const id = idYoutube(videoId);
  if (!id || !pageOrigin || pageOrigin === "null") return null;

  const url = new URL(`/embed/${encodeURIComponent(id)}`, YOUTUBE_ORIGIN);
  url.search = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    enablejsapi: "1",
    origin: pageOrigin,
  }).toString();
  return url.toString();
}

// APK Android : l'iframe YouTube chargée depuis l'origine https://localhost est refusée (référent invalide,
// erreur 152/153) ou ne donne que le son. On charge donc une page relais hébergée sous un vrai domaine
// (public/youtube-embed.html sur membres.chay.fr), qui contient le lecteur officiel (IFrame API).
// Le site web garde l'iframe YouTube directe.
export const YOUTUBE_RELAIS_CHEMIN = "/youtube-embed.html";
export const DELAI_RELAIS_MS = 15000;
export const youtubeViaRelais = (platform) => platform === "android";

/**
 * Lecteur à utiliser : { relais, origin (origine des messages à accepter / viser), url(videoId) }.
 * @param {{ platform: string, pageOrigin: string, relaisBase: string }} options
 */
export function lecteurYoutube({ platform, pageOrigin, relaisBase }) {
  if (!youtubeViaRelais(platform)) {
    return { relais: false, origin: YOUTUBE_ORIGIN, url: (videoId) => buildYouTubeEmbedUrl(videoId, pageOrigin) };
  }
  let origin = null;
  try {
    const u = new URL(String(relaisBase || ""));
    if (u.protocol === "https:") origin = u.origin;
  } catch {
    origin = null;
  }
  return {
    relais: true,
    origin,
    url: (videoId) => {
      const id = idYoutube(videoId);
      if (!id || !origin || !pageOrigin || pageOrigin === "null") return null;
      const url = new URL(YOUTUBE_RELAIS_CHEMIN, origin);
      url.search = new URLSearchParams({ v: id, parent: pageOrigin }).toString();
      return url.toString();
    },
  };
}

/** Message affiché quand la vidéo ne peut pas être lue dans l'app (bouton « Ouvrir dans YouTube » à côté). */
export function messageErreurYoutube(code) {
  const n = Number(code);
  if (n === 101 || n === 150 || n === 152 || n === 153) {
    return "La chaîne n'autorise pas la lecture de cette vidéo en dehors de YouTube.";
  }
  if (n === 2 || n === 5 || n === 100) return "Cette vidéo est indisponible ou privée.";
  return "Le lecteur vidéo n'a pas pu se charger.";
}
