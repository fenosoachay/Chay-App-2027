// 1.4.1 : Multimédia › Musique › Classement : les musiques les plus écoutées.
// Chaque membre ne reçoit du serveur que les titres qu'il peut écouter (règles « C'est pour » : Utilisateur,
// Membre, VIP) : le classement d'un utilisateur, d'un membre ou d'un VIP se fait donc sur SES musiques.
// Écoutes : PlaylistTrack.listen_count (+1 à la moitié d'une écoute, route compterVue).

const categorieDe = (p) => p?.category || "music";
const nombre = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** Titres de Musique classés : [{ ...ligne PlaylistTrack, ecoutes, rang }] (un titre présent dans plusieurs playlists une seule fois). */
export function classerMusiques(playlists, playlistTracks) {
  const pls = (Array.isArray(playlists) ? playlists : []).filter((p) => p && categorieDe(p) === "music");
  const ids = new Set(pls.map((p) => p.id));
  const pochettes = new Map(pls.map((p) => [p.id, p.cover_url || ""]));
  const parTitre = new Map();
  for (const t of Array.isArray(playlistTracks) ? playlistTracks : []) {
    if (!t || !ids.has(t.playlist_id) || !t.audio_url || !t.track_id) continue;
    const ecoutes = nombre(t.listen_count);
    const deja = parTitre.get(t.track_id);
    if (!deja) {
      parTitre.set(t.track_id, { ...t, cover_url: t.cover_url || pochettes.get(t.playlist_id) || "", ecoutes });
    } else {
      if (ecoutes > deja.ecoutes) deja.ecoutes = ecoutes;
      if (!deja.cover_url) deja.cover_url = t.cover_url || pochettes.get(t.playlist_id) || "";
    }
  }
  return [...parTitre.values()]
    .sort((a, b) => b.ecoutes - a.ecoutes || String(a.title || "").localeCompare(String(b.title || ""), "fr", { sensitivity: "base" }))
    .map((t, i) => ({ ...t, rang: i + 1 }));
}

/** Rangées de 5 (la dernière peut être plus courte). */
export function rangees(liste, parRangee = 5) {
  const out = [];
  for (let i = 0; i < (liste || []).length; i += parRangee) out.push(liste.slice(i, i + parRangee));
  return out;
}

/** « 1 écoute », « 1 520 écoutes ». */
export function texteEcoutes(n) {
  const v = nombre(n);
  return `${v.toLocaleString("fr-FR")} écoute${v > 1 ? "s" : ""}`;
}
