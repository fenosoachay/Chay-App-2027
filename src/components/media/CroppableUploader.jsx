import React, { useState } from "react";
import { Upload, X, Loader2, ImagePlus } from "lucide-react";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import ImageCrop from "@/components/media/ImageCrop";

export default function CroppableUploader({
  value,
  onChange,
  aspect = 1,
  allowOriginal = false,
  crop = true,
  label = "Image",
  accept = "image/*",
}) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onPick = (f) => {
    if (!f) return;
    if (crop) {
      setFile(f);
      setCropOpen(true);
    } else {
      upload(f);
    }
  };

  const upload = async (blob) => {
    setUploading(true);
    try {
      const url = await uploadToBase44(blob);
      // Second argument : l'image a-t-elle été explicitement rognée ? Les
      // cartes d'articles affichent les images non rognées en taille
      // originale (object-cover plein fond) et les images rognées avec le
      // cadrage enregistré. Sans callback bivalent, comportement inchangé.
      onChange?.(url, cropOpen);
      setCropOpen(false);
      setFile(null);
    } catch (e) {
      toast({ title: "Échec de l'import", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black" style={{ aspectRatio: aspect }}>
          <img src={value} alt="" className="absolute inset-0 w-full h-full object-contain" />
          <button
            type="button"
            onClick={() => onChange?.("")}
            className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
          <label className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 text-white px-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-black/80">
            <ImagePlus className="h-3.5 w-3.5" /> Changer
            <input type="file" accept={accept} className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background px-4 py-8 cursor-pointer hover:border-primary transition">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-primary" />}
          <span className="text-sm font-medium text-foreground/70">{uploading ? "Import…" : `Choisir ${label}`}</span>
          <input type="file" accept={accept} className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      )}

      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rogner l'image</DialogTitle>
            <DialogDescription>Ajustez le cadre, puis validez.</DialogDescription>
          </DialogHeader>
          {file && (
            <ImageCrop
              file={file}
              aspect={aspect}
              allowOriginal={allowOriginal}
              onCancel={() => { setCropOpen(false); setFile(null); }}
              onConfirm={(blob) => upload(blob)}
            />
          )}
          {uploading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Import…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}