import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload, Music, Film } from "lucide-react";

export default function AddPlaylistTrackModal({
  open,
  onOpenChange,
  playlist,
  category: _category,
  kind = "audio",
  onSaved,
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const isVideo = kind === "video";

  useEffect(() => {
    if (open) {
      setTitle("");
      setArtist("");
      setMediaFile(null);
      setCoverFile(null);
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim() || !mediaFile) {
      toast({ title: "Titre et fichier requis", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const mediaUrl = await uploadToBase44(mediaFile);
      let coverUrl = "";
      if (coverFile) {
        coverUrl = await uploadToBase44(coverFile);
      }
      const track_id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await base44.entities.PlaylistTrack.create({
        playlist_id: playlist.id,
        track_id,
        title: title.trim(),
        artist: artist.trim() || null,
        audio_url: isVideo ? null : mediaUrl,
        video_url: isVideo ? mediaUrl : null,
        cover_url: coverUrl || null,
        kind: isVideo ? "video" : "audio",
        order: Date.now(),
      });
      toast({ title: "Titre ajouté à la playlist" });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isVideo ? (
              <Film className="h-5 w-5 text-primary" />
            ) : (
              <Music className="h-5 w-5 text-primary" />
            )}
            Ajouter un titre
          </DialogTitle>
          <DialogDescription>dans « {playlist?.name} »</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pt-title">Titre *</Label>
            <Input
              id="pt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre du titre"
            />
          </div>

          {!isVideo && (
            <div className="space-y-2">
              <Label htmlFor="pt-artist">Artiste / Prédicateur</Label>
              <Input
                id="pt-artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{isVideo ? "Fichier MP4 *" : "Fichier MP3 *"}</Label>
            <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-4 cursor-pointer hover:border-primary transition">
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium truncate flex-1">
                {mediaFile ? mediaFile.name : "Choisir un fichier…"}
              </span>
              <input
                type="file"
                accept={isVideo ? "video/*" : "audio/*"}
                className="hidden"
                onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <Label>Image de couverture (optionnel)</Label>
            <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-4 cursor-pointer hover:border-primary transition">
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium truncate flex-1">
                {coverFile ? coverFile.name : "Choisir une image…"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <Button
            onClick={submit}
            disabled={loading}
            className="w-full brand-gradient text-white border-0"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Ajouter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}