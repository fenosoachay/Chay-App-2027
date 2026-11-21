import React, { useState, useEffect, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { backendText } from "@/api/backendConfig";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Library, Upload } from "lucide-react";
import ImageCrop from "@/components/media/ImageCrop";
import PlaylistCover from "@/components/media/PlaylistCover";
import { isValidPlaylistImageUrl } from "@/lib/playlist";
import { AFFICHAGES, affichageDe } from "@/lib/affichagePlaylist";

export default function CreatePlaylistModal({
  open,
  onOpenChange,
  onSaved,
  category = "music",
  playlist = null,
  parent = null, // création d'une sous-playlist de cette playlist
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Section Vidéo : affichage de lecture, Film (16:9) ou TikTok (9:16) — à choisir pour une nouvelle playlist.
  const estVideo = (playlist?.category || category) === "films";
  const [affichage, setAffichage] = useState("");
  const [coverUrl, setCoverUrl] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const fileRef = useRef(null);
  const pendingPlaylistIdRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(playlist?.name || "");
      setDescription(playlist?.description || "");
      setAffichage(playlist ? affichageDe(playlist) : "");
      setCoverUrl(playlist?.cover_url || null);
      setRawFile(null);
      setUploading(false);
      setValidationAttempted(false);
      setUploadError("");
      setSaveError("");
      pendingPlaylistIdRef.current = null;
    } else {
      pendingPlaylistIdRef.current = null;
    }
  }, [open, playlist]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f && !f.type.startsWith("image/")) {
      setUploadError("Le fichier choisi n'est pas une image. Sélectionnez un fichier image.");
      toast({
        title: "Fichier non valide",
        description: "Choisissez un fichier image pour la playlist.",
        variant: "destructive",
      });
    } else if (f) {
      setUploadError("");
      setRawFile(f);
    }
    e.target.value = "";
  };

  const onCropConfirm = async (blob) => {
    setUploading(true);
    setUploadError("");
    try {
      const file = new File([blob], "icon.jpg", { type: "image/jpeg" });
      // Core.UploadFile : seule API d'upload officielle du SDK Base44.
      const url = await uploadToBase44(file);
      setCoverUrl(url);
      setRawFile(null);
      setSaveError("");
      toast({ title: "Image enregistrée" });
    } catch (err) {
      const message = err.message || "Réessayez.";
      setUploadError(`L'image n'a pas pu être envoyée : ${message}`);
      toast({ title: "Erreur upload image", description: message, variant: "destructive" });
      setRawFile(null);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setValidationAttempted(true);
    setSaveError("");
    if (!name.trim() || !isValidPlaylistImageUrl(coverUrl)) return;
    if (estVideo && !affichage) return;
    setSaving(true);
    try {
      const playlistData = {
        name: name.trim(),
        description: description.trim() || null,
        cover_url: coverUrl,
        category: playlist?.category || category,
        // Sous-playlist : rattachée à sa playlist (la modification garde le rattachement existant).
        parent_id: playlist ? playlist.parent_id || "" : parent?.id || "",
        ...(estVideo ? { affichage } : {}),
      };
      const playlistId = playlist?.id || pendingPlaylistIdRef.current;
      let savedPlaylist;

      if (playlistId) {
        await base44.entities.Playlist.update(playlistId, playlistData);
        savedPlaylist = await base44.entities.Playlist.get(playlistId);
      } else {
        savedPlaylist = await base44.entities.Playlist.create(playlistData);
        if (!savedPlaylist?.id) {
          throw new Error(backendText("Base44 n'a pas renvoyé l'identifiant de la playlist.", "Le serveur n'a pas renvoyé l'identifiant de la playlist."));
        }
        pendingPlaylistIdRef.current = savedPlaylist.id;
        savedPlaylist = await base44.entities.Playlist.get(savedPlaylist.id);
      }

      // Rattachement (sous-playlist) et section réellement enregistrés ?
      const matchesSubmittedData = (saved) =>
        saved?.name === playlistData.name &&
        saved?.cover_url === playlistData.cover_url &&
        (saved?.description ?? null) === playlistData.description;
      if (!matchesSubmittedData(savedPlaylist)) {
        const id = playlistId || pendingPlaylistIdRef.current;
        await base44.entities.Playlist.update(id, playlistData);
        savedPlaylist = await base44.entities.Playlist.get(id);
      }
      if (!matchesSubmittedData(savedPlaylist)) {
        const message =
          backendText(
            "Base44 n'a pas conservé le nom ou l'image. Vérifiez les champs « name » et « cover_url » de l'entité Playlist, puis publiez.",
            "Le serveur n'a pas conservé le nom ou l'image. Vérifiez les champs « name » et « cover_url » de la collection Playlist.",
          );
        setSaveError(message);
        toast({ title: "Playlist non enregistrée", description: message, variant: "destructive" });
        return;
      }

      pendingPlaylistIdRef.current = null;
      toast({ title: playlist ? "Playlist modifiée" : "Playlist créée" });
      onOpenChange(false);
      onSaved?.(savedPlaylist);
    } catch (e) {
      setSaveError(e.message || "Une erreur inattendue a empêché l'enregistrement.");
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && (saving || uploading)) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-md rounded-[1.5rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display font-extrabold">
            <Library className="h-5 w-5 text-primary" /> {playlist
              ? playlist.parent_id ? "Modifier la sous-playlist" : "Modifier la playlist"
              : parent ? `Nouvelle sous-playlist de « ${parent.name} »` : "Créer une playlist"}
          </DialogTitle>
          <DialogDescription>
            {playlist
              ? "Modifiez le nom, la description ou l'image de cette playlist."
              : "Valable pour toute la Médiathèque : musique, prédications, films."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Image de couverture obligatoire */}
          <div className="space-y-2">
            <Label>Image de la playlist <span className="text-destructive">*</span></Label>
            {rawFile ? (
              <ImageCrop
                file={rawFile}
                onCancel={() => {
                  setRawFile(null);
                  setUploadError("");
                }}
                onConfirm={onCropConfirm}
              />
            ) : uploading ? (
              <div className="flex items-center justify-center h-32 text-sm text-foreground/60 gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Téléversement…
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <PlaylistCover
                  playlist={{ name, cover_url: coverUrl }}
                  className="h-20 w-20 shrink-0 rounded-2xl"
                />
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-full text-sm font-bold"
                  >
                    <Upload className="h-4 w-4 mr-1.5" /> {coverUrl ? "Changer l'image" : "Choisir une image"}
                  </Button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  className="hidden"
                />
              </div>
            )}
            {validationAttempted && !isValidPlaylistImageUrl(coverUrl) && !rawFile && !uploadError && (
              <p className="text-xs text-destructive" role="alert">
                Une image de playlist est obligatoire. Choisissez puis envoyez une image.
              </p>
            )}
            {rawFile && validationAttempted && (
              <p className="text-xs text-destructive" role="alert">
                Confirmez le cadrage de l'image pour terminer son ajout.
              </p>
            )}
            {uploading && (
              <p className="text-xs text-foreground/60" role="status">
                Attendez la fin du téléversement de l'image avant d'enregistrer.
              </p>
            )}
            {uploadError && <p className="text-xs text-destructive" role="alert">{uploadError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pl-name">
              Nom de la playlist <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pl-name"
              value={name}
              required
              aria-invalid={validationAttempted && !name.trim()}
              onChange={(e) => {
                setName(e.target.value);
                setSaveError("");
              }}
              placeholder="Ex. Louanges du dimanche"
            />
            {validationAttempted && !name.trim() && (
              <p className="text-xs text-destructive" role="alert">
                Le nom de la playlist est obligatoire.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pl-desc">Description (optionnel)</Label>
            <Textarea
              id="pl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Quelques mots…"
            />
          </div>

          {estVideo && (
            <div className="space-y-2">
              <Label>Affichage de la lecture <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Affichage de la lecture">
                {AFFICHAGES.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={affichage === a.value}
                    onClick={() => setAffichage(a.value)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition ${affichage === a.value ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    {/* Petit cadre au bon format */}
                    <span
                      className={`grid place-items-center rounded-md border-2 border-current text-[0.6rem] font-black ${a.value === "film" ? "h-9 w-16" : "h-14 w-8"}`}
                      aria-hidden="true"
                    >
                      {a.format}
                    </span>
                    <span className="text-sm font-bold">{a.label} ({a.format})</span>
                    <span className="text-[0.7rem] leading-tight text-foreground/60">{a.description}</span>
                  </button>
                ))}
              </div>
              {validationAttempted && !affichage && (
                <p className="text-xs text-destructive" role="alert">Choisissez l'affichage de la lecture.</p>
              )}
            </div>
          )}

          <Button
            onClick={save}
            disabled={saving || uploading}
            className="w-full brand-gradient text-white border-0"
          >
            {saving || uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {uploading
              ? "Téléversement de l'image…"
              : saving
                ? "Enregistrement…"
                : playlist
                  ? "Enregistrer les modifications"
                  : "Créer la playlist"}
          </Button>
          {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}