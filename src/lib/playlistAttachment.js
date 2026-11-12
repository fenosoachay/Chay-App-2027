import { IS_POCKETBASE, backendText } from "../api/backendConfig.js";

export function buildPlaylistTrackRecord({
  entity,
  playlistId,
  item,
  submittedData = {},
  coverField = "cover_url",
}) {
  if (!item?.id || !playlistId) {
    throw new Error("Un identifiant de contenu et de playlist est requis.");
  }

  return {
    playlist_id: playlistId,
    track_id: item.id,
    title: item.title || submittedData.title,
    artist: item.artist || item.speaker || submittedData.artist || submittedData.speaker || null,
    audio_url: item.audio_url || submittedData.audio_url || null,
    // Miniature : couverture, image (Galerie) ou miniature YouTube.
    video_url: item.video_url || submittedData.video_url || null,
    cover_url:
      item[coverField] ||
      submittedData[coverField] ||
      item.cover_url ||
      submittedData.cover_url ||
      item.thumbnail_url ||
      item.image_url ||
      (item.youtube_id ? `https://img.youtube.com/vi/${item.youtube_id}/hqdefault.jpg` : null) ||
      null,
    // audio / video : pistes (Musique, Prédication, Films) ; vide pour YouTube, Articles, Galerie.
    kind: entity === "Video" ? "video" : entity === "MusicTrack" || entity === "Sermon" ? "audio" : "",
    order: Date.now(),
  };
}

export function resolveSelectedPlaylistId(selectedPlaylistId, submittedPlaylistId) {
  return selectedPlaylistId === null ? submittedPlaylistId : selectedPlaylistId;
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findPersistedPlaylistTrack(entity, record, attempts = 1) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await entity.filter(
      { track_id: record.track_id, playlist_id: record.playlist_id },
      "-created_date",
      100
    );
    const persisted = (Array.isArray(rows) ? rows : []).find(
      (row) =>
        row.track_id === record.track_id &&
        row.playlist_id === record.playlist_id
    );
    if (persisted) return persisted;
    if (attempt + 1 < attempts) await wait(150 * (attempt + 1));
  }
  return null;
}

export async function savePlaylistTrack(
  entity,
  record,
  mediaField,
  { checkExisting = false } = {}
) {
  // mediaField null : contenu sans fichier audio / vidéo (YouTube, article, image).
  const requiredFields = ["playlist_id", "track_id", "title", mediaField].filter(Boolean);
  const missingFields = (persisted) =>
    requiredFields.filter((field) => persisted?.[field] !== record[field]);
  const repair = async (persisted) => {
    const missing = missingFields(persisted);
    if (missing.length && persisted?.id) {
      await entity.update(
        persisted.id,
        Object.fromEntries(missing.map((field) => [field, record[field]]))
      );
    }
  };

  let persisted = checkExisting
    ? await findPersistedPlaylistTrack(entity, record)
    : null;
  let createError;
  let created;
  let createdId;
  let readError;

  if (!persisted) {
    try {
      created = await entity.create(record);
      createdId = created?.id;
    } catch (error) {
      createError = error;
    }
    if (createdId && missingFields(created).length) {
      let createdRecord;
      try {
        createdRecord = await entity.get(createdId);
      } catch (error) {
        readError = error;
      }
      if (createdRecord) await repair(createdRecord);
    }
    if (!persisted) persisted = await findPersistedPlaylistTrack(entity, record, 4);
  }

  if (!persisted) {
    if (readError) {
      throw new Error(
        `${backendText("Base44", "Le serveur")} n'a pas confirmé le lien playlist : ${readError.message || String(readError)}`
      );
    }
    if (createError) throw createError;
    throw new Error(
      `${backendText("Base44", "Le serveur")} n'a pas confirmé l'ajout du contenu à la playlist. Le contenu reste enregistré; réessayez l'ajout.`
    );
  }

  await repair(persisted);
  persisted = await findPersistedPlaylistTrack(entity, record, 4);
  const stillMissing = missingFields(persisted);
  if (stillMissing.length) {
    throw new Error(
      backendText(
        `Base44 n'a pas enregistré le lien playlist (${stillMissing.join(", ")}). Vérifiez les champs de l'entité PlaylistTrack, puis publiez.`,
        `Le serveur n'a pas enregistré le lien playlist (${stillMissing.join(", ")}). Vérifiez les champs de la collection PlaylistTrack.`,
      )
    );
  }
  return persisted;
}

/**
 * Suppression d'une playlist avec ses contenus (écran admin EntityCrud).
 * Mode PocketBase : vrai filtre sur playlist_id ; une erreur de lecture arrête tout (rien n'est supprimé,
 * pas de contenus orphelins). Mode Base44 : appel d'origine inchangé (filtre passé comme tri, erreurs ignorées).
 * @returns nombre de liens PlaylistTrack traités
 */
export async function deletePlaylistWithContents(api, entity, playlistId, isPocketBase = IS_POCKETBASE) {
  const rows = isPocketBase
    ? await api.entities.PlaylistTrack.filter({ playlist_id: playlistId }, "-created_date", 5000)
    : await api.entities.PlaylistTrack.list(`-playlist_id eq "${playlistId}"`, 500).catch(() => []);
  const list = (Array.isArray(rows) ? rows : []).filter((pt) => !isPocketBase || pt.playlist_id === playlistId);
  for (const pt of list) {
    await api.entities[entity].delete(pt.track_id).catch(() => {});
    await api.entities.PlaylistTrack.delete(pt.id).catch(() => {});
  }
  await api.entities.Playlist.delete(playlistId);
  return list.length;
}
