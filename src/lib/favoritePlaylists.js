export function groupMusicFavorites(items) {
  const musicItems = (Array.isArray(items) ? items : [])
    .filter((item) => (item.category || "music") === "music" && item.kind !== "video")
    .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999));

  return [{
    id: "all-favorites",
    name: "Favoris",
    order: 0,
    items: musicItems,
  }];
}
