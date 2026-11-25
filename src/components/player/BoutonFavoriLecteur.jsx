import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// 1.3.34 : étoile du lecteur plein écran : ajoute ou retire le titre en cours de « Votre Playlist » (favoris
// Musique, PlaylistItem), comme l'étoile de la liste des titres. Seulement pour la Musique rangée en playlist.
export const peutEtreFavori = (piste) => Boolean(piste && piste.mediaType === "music" && piste.id && piste.playlist_id);

export default function BoutonFavoriLecteur({ piste }) {
  const { toast } = useToast();
  const [favori, setFavori] = useState(null); // ligne PlaylistItem, ou null
  const [occupe, setOccupe] = useState(false);
  const actif = peutEtreFavori(piste);

  useEffect(() => {
    setFavori(null);
    if (!actif) return undefined;
    let vivant = true;
    base44.entities.PlaylistItem.filter({ track_id: piste.id, source_playlist_id: piste.playlist_id }, "-created_date", 1)
      .then((r) => { if (vivant) setFavori(Array.isArray(r) && r[0] ? r[0] : null); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [actif, piste?.id, piste?.playlist_id]);

  const basculer = async () => {
    if (!actif || occupe) return;
    setOccupe(true);
    try {
      if (favori) {
        await base44.entities.PlaylistItem.delete(favori.id);
        setFavori(null);
        toast({ title: "Retiré de Votre Playlist" });
      } else {
        const liste = await base44.entities.PlaylistItem.list("-created_date", 500).catch(() => []);
        const tous = Array.isArray(liste) ? liste : [];
        const memePlaylist = tous.filter((p) => p.source_playlist_id === piste.playlist_id);
        const pl = await base44.entities.Playlist.get(piste.playlist_id).catch(() => null);
        const cree = await base44.entities.PlaylistItem.create({
          track_id: piste.id,
          title: piste.title,
          artist: piste.artist || null,
          audio_url: piste.audio_url || null,
          video_url: null,
          cover_url: piste.cover_url || null,
          kind: "audio",
          category: "music",
          source_playlist_id: piste.playlist_id,
          source_playlist_name: pl?.name || "",
          order: tous.reduce((m, p) => Math.max(m, (p.order ?? -1) + 1), 0),
          playlist_order: memePlaylist.length
            ? Math.min(...memePlaylist.map((p) => p.playlist_order ?? 99999))
            : tous.reduce((m, p) => Math.max(m, (p.playlist_order ?? -1) + 1), 0),
        });
        setFavori(cree);
        toast({ title: "Ajouté à Votre Playlist" });
      }
    } catch (e) {
      toast({ title: "Favori non enregistré", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <button
      type="button"
      onClick={basculer}
      disabled={!actif || occupe}
      aria-pressed={Boolean(favori)}
      aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
      className={`h-11 w-11 grid place-items-center rounded-full transition disabled:opacity-30 ${favori ? "text-[#F5B800]" : "text-foreground/60 hover:text-foreground"}`}
    >
      <Star className="h-5 w-5" fill={favori ? "currentColor" : "none"} />
    </button>
  );
}
