import { base44 } from "@/api/base44Client";

/**
 * Crée une notification in-app pour tous les utilisateurs après upload admin.
 * Le lien mène directement vers le contenu dans Multimédia.
 *
 * @param {object} opts
 * @param {"music"|"sermon"|"film"|"youtube"|"article"|"gallery"} opts.kind
 * @param {string} opts.title        Titre du contenu
 * @param {string} [opts.artist]     Artiste (musique)
 * @param {string} [opts.playlist]   Nom de la playlist
 * @param {string} [opts.playlistId] Identifiant de la playlist
 * @param {string} [opts.section]    Section YouTube (culte/louange/celebration)
 * @param {string} [opts.contentId]  ID du contenu créé (pour lien direct)
 */
export async function notifyAdminUpload({
  kind,
  title,
  artist,
  playlist,
  playlistId,
  section,
  contentId,
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
    case "gallery":
      message = `Une photo a été postée. Visionnez.`;
      linkPath = `/media?cat=gallery`;
      contentType = "gallery";
      resourceType = "GalleryImage";
      break;
    default:
      message = `Nouveau contenu : « ${title} ».`;
  }

  try {
    // Crée une entrée Content visible dans NewContentsSection
    const content = await base44.entities.Content.create({
      status: "published",
      published_at: new Date().toISOString(),
      type: contentType,
      title,
      // Texte de la notification (in-app et push) : notifyNewContent lit la description du Content.
      description: message,
      resource_id: contentId || null,
      resource_type: resourceType || null,
      playlist_id: playlistId || null,
      category: playlist || section || null,
      link: linkPath,
    });

    // Fan-out notifications in-app via la fonction backend existante.
    // La fonction attend l'identifiant de l'entrée Content (content_id) : sans lui, elle répond
    // 400 « content_id required » et personne n'est notifié (bogue hérité de Base44).
    if (!content?.id) return;
    await base44.functions.invoke("notifyNewContent", {
      content_id: content.id,
      send_email: false,
    }).catch((e) => console.warn("[notifyNewContent]", e?.message || e));
  } catch {
    // Silencieux — l'upload a réussi, la notif est best-effort
  }
}
