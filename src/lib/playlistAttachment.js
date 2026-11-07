import { backendText } from "../api/backendConfig.js";

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
    video_url: item.video_url || submittedData.video_url || null,
    cover_url:
      item[coverField] ||
      submittedData[coverField] ||
      item.cover_url ||
      submittedData.cover_url ||
      null,
    kind: entity === "Video" ? "video" : "audio",
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
  const requiredFields = ["playlist_id", "track_id", "title", mediaField];
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
