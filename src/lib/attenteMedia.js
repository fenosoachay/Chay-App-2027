// Image d'attente Chay (1.3.25) : tant qu'une photo ou une vidéo venue d'internet charge, son cadre montre un fond
// gris avec le motif de petits logos Chay (public/branding/attente-chay.jpg). Si la photo ne peut pas s'afficher
// (lien cassé, hors connexion), l'image d'attente reste à sa place, comme marque d'erreur.
export const IMAGE_ATTENTE = "/branding/attente-chay.jpg";
const CLASSE = "chay-attente";

/** Faut-il une image d'attente pour cet élément ? (photos/vidéos distantes seulement ; jamais l'image d'attente elle-même) */
export function concerne(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (el.dataset?.sansAttente !== undefined) return false;
  if (tag === "video") return true;
  if (tag !== "img") return false;
  const src = String(el.getAttribute("src") || "");
  return /^https?:\/\//i.test(src) && !src.includes(IMAGE_ATTENTE);
}

function suivreImage(img) {
  if (img.__chayAttente) return;
  img.__chayAttente = true;
  const fini = () => img.classList.remove(CLASSE);
  const erreur = () => {
    img.classList.remove(CLASSE);
    if (!img.getAttribute("src")?.includes(IMAGE_ATTENTE)) {
      img.removeAttribute("srcset");
      img.src = IMAGE_ATTENTE;
      img.style.objectFit = "cover";
    }
  };
  img.addEventListener("load", fini);
  img.addEventListener("error", erreur);
  if (img.complete) {
    if (img.naturalWidth === 0) erreur();
  } else {
    img.classList.add(CLASSE);
  }
}

function suivreVideo(video) {
  if (video.__chayAttente) return;
  video.__chayAttente = true;
  // 1.3.28 : toute vidéo sans couverture montre l'image d'attente Chay (et jamais l'image grise « lecture » du
  // téléphone, que l'app Android affiche tant qu'une vidéo n'a pas d'image) : miniatures, lecteurs, futures vidéos.
  if (!video.getAttribute("poster")) video.setAttribute("poster", IMAGE_ATTENTE);
  const fini = () => video.classList.remove(CLASSE);
  if (video.readyState < 2) video.classList.add(CLASSE);
  // 1.3.27 : un même lecteur sert à plusieurs vidéos (lecteur de l'app) : à chaque nouvelle vidéo, l'image
  // d'attente revient jusqu'à la première image.
  video.addEventListener("loadstart", () => { if (video.readyState < 2) video.classList.add(CLASSE); });
  video.addEventListener("loadeddata", fini);
  video.addEventListener("playing", fini);
  video.addEventListener("error", () => { if (!video.poster) video.poster = IMAGE_ATTENTE; });
}

function suivre(el) {
  if (!concerne(el)) return;
  if (el.tagName.toLowerCase() === "video") suivreVideo(el);
  else suivreImage(el);
}

/** À appeler une fois au démarrage : suit toutes les photos et vidéos ajoutées à la page. */
export function installerAttenteMedia(racine = globalThis.document || null) {
  const Observateur = globalThis.MutationObserver;
  if (!racine || typeof Observateur !== "function") return () => {};
  racine.querySelectorAll("img, video").forEach(suivre);
  const obs = new Observateur((changements) => {
    for (const c of changements) {
      if (c.type === "attributes") {
        // Nouvelle adresse sur une image déjà suivie : elle recharge.
        const el = c.target;
        if (el.tagName?.toLowerCase() === "img" && concerne(el) && !el.complete) el.classList.add(CLASSE);
        else suivre(el);
        continue;
      }
      for (const n of c.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "IMG" || n.tagName === "VIDEO") suivre(n);
        else n.querySelectorAll?.("img, video").forEach(suivre);
      }
    }
  });
  obs.observe(racine.documentElement || racine, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  return () => obs.disconnect();
}
