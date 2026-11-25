import { base44 } from "@/api/base44Client";

/**
 * Crée une notification in-app pour tous les utilisateurs après upload admin.
 * Le lien mène directement vers le contenu dans Multimédia.
 *
 * @param {object} opts
 * @param {"music"|"sermon"|"film"|"youtube"|"article"|"gallery"|"annonce"|"reunion"|"paroles"|"verset"} opts.kind
 * @param {string} opts.title        Titre du contenu
 * @param {string} [opts.artist]     Artiste (musique)
 * @param {string} [opts.playlist]   Nom de la playlist
 * @param {string} [opts.playlistId] Identifiant de la playlist
 * @param {string} [opts.section]    Section YouTube (culte/louange/celebration)
 * @param {string} [opts.contentId]  ID du contenu créé (pour lien direct)
 * @param {string} [opts.attention]  1.3.34 : notification manuelle (Mindset) ; ce texte remplace le message
 */
export async function notifyAdminUpload({
  kind,
  title,
  artist,
  playlist,
  playlistId,
  section,
  contentId,
  audience,
  attention,
}) {
  let message = "";
  let linkPath = "/media";
  let contentType = "autre";
  let resourceType = "";

  switch (kind) {
    case "music":
      message = `« ${title} » de ${artist || "Artiste inconnu"} a été ajoutée dans « ${playlist || "une playlist"} ».`;
      linkPath = `/media?cat=music`;
      contentType = "audio";
      resourceType = "MusicTrack";
      break;
    case "sermon":
      message = `La prédication « ${title} » a été ajoutée.`;
      linkPath = `/media?cat=sermons`;
      contentType = "predication";
      resourceType = "Sermon";
      break;
    case "film":
      message = `Le film « ${title} » a été ajouté dans « ${playlist || "une playlist"} ».`;
      linkPath = `/media?cat=films`;
      contentType = "video";
      resourceType = "Video";
      break;
    case "film_enfant":
      message = `La vidéo « ${title} » a été ajoutée dans Chay Enfants${playlist ? ` (« ${playlist} »)` : ""}.`;
      linkPath = "/kids?vue=videos";
      contentType = "video";
      resourceType = "VideoEnfant";
      break;
    case "youtube": {
      const sectionLabels = { culte: "Culte", louange: "Louange", celebration: "Célébration" };
      message = `La vidéo « ${title} » a été ajoutée dans « ${sectionLabels[section] || section || "YouTube"} ».`;
      linkPath = `/media?cat=youtube`;
      contentType = "youtube";
      resourceType = "YouTubeVideo";
      break;
    }
    case "article":
      message = `L'article « ${title} » a été publié.`;
      linkPath = `/media?cat=articles`;
      contentType = "article";
      resourceType = "Article";
      break;
    case "reunion":
      message = `Nouvelle réunion : « ${title} ».`;
      linkPath = `/`;
      contentType = "evenement";
      resourceType = "Announcement";
      break;
    case "annonce":
      message = `Nouvelle annonce : « ${title} ».`;
      linkPath = `/`;
      contentType = "annonce";
      resourceType = "Announcement";
      break;
    case "paroles":
      message = `Nouvelles paroles : « ${title} ».`;
      linkPath = contentId ? `/media?cat=paroles&parole=${encodeURIComponent(contentId)}` : `/media?cat=paroles`;
      contentType = "autre";
      resourceType = "Paroles";
      break;
    case "verset":
      message = `Nouveau verset : « ${title} ».`;
      linkPath = contentId ? `/media?cat=verset&verset=${encodeURIComponent(contentId)}` : `/media?cat=verset`;
      contentType = "autre";
      resourceType = "Verset";
      break;
    case "gallery":
      message = `Une photo a été postée. Visionnez.`;
      linkPath = `/media?cat=gallery`;
      contentType = "gallery";
      resourceType = "GalleryImage";
      break;
    default:
      message = `Nouveau contenu : « ${title} ».`;
  }
  // 1.3.34 : « Chay attire ton attention sur… » (envoyée à la main par un admin, playlists Mindset).
  if (attention) message = attention;

  try {
    // Crée une entrée Content visible dans NewContentsSection
    const content = await base44.entities.Content.create({
      status: "published",
      published_at: new Date().toISOString(),
      type: contentType,
      title: attention ? "Chay" : title,
      // Texte de la notification (in-app et push) : notifyNewContent lit la description du Content.
      description: message,
      resource_id: contentId || null,
      resource_type: resourceType || null,
      playlist_id: playlistId || null,
      // Contenu réservé (Membre / VIP) : la notification ne va qu'à ceux qui peuvent le voir (serveur).
      audience: audience || "tous",
      category: playlist || section || null,
      link: linkPath,
    });

    // Fan-out notifications in-app via la fonction backend existante.
    // La fonction attend l'identifiant de l'entrée Content (content_id) : sans lui, elle répond
    // 400 « content_id required » et personne n'est notifié (bogue hérité de Base44).
    if (!content?.id) return false;
    const envoi = await base44.functions.invoke("notifyNewContent", {
      content_id: content.id,
      send_email: false,
    }).catch((e) => { console.warn("[notifyNewContent]", e?.message || e); return null; });
    return Boolean(envoi);
  } catch {
    // Silencieux — l'upload a réussi, la notif est best-effort
    return false;
  }
}

