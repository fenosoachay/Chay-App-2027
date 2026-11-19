import React, { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Printer } from "lucide-react";
import CroppableUploader from "@/components/media/CroppableUploader";
import { notifyAdminUpload } from "@/lib/adminNotify";
import { idYoutube } from "@/lib/youtubeEmbed";

const extractYtId = (value) => idYoutube(value);

export default function AddYouTubeLinkModal({ open, onOpenChange, section = "culte", onSaved }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [verseNote, setVerseNote] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(""); setLink(""); setCoverUrl(""); setVerseNote("");
    }
  }, [open]);

  const sectionLabels = { culte: "Culte", louange: "Louange", celebration: "Célébration" };

  const submit = async () => {
    const id = extractYtId(link.trim());
    if (!title.trim() || !id) {
      toast({ title: "Titre et lien YouTube valides requis", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const created = await base44.entities.YouTubeVideo.create({
        title: title.trim(),
        youtube_id: id,
        cover_url: coverUrl || null,
        verse_note: verseNote.trim() || null,
        section,
        category: sectionLabels[section] || "Louange",
      });
      toast({ title: "Vidéo ajoutée" });
      notifyAdminUpload({ kind: "youtube", title: title.trim(), section, contentId: created?.id });
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
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter une vidéo YouTube</DialogTitle>
          <DialogDescription>{sectionLabels[section] || "Louange"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="yt-title">Titre *</Label>
            <Input id="yt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la vidéo" />
          </div>

          <div className="space-y-2">
            <Label>Image (vignette)</Label>
            <CroppableUploader value={coverUrl} onChange={setCoverUrl} aspect={16 / 9} allowOriginal crop />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="yt-note">Note de versets</Label>
              {verseNote.trim() && (
                <button
                  type="button"
                  onClick={() => printNote(title || "Note de versets", verseNote)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimer
                </button>
              )}
            </div>
            <Textarea
              id="yt-note"
              value={verseNote}
              onChange={(e) => setVerseNote(e.target.value)}
              placeholder="Versets et références liés à la vidéo…"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt-link">Lien ou ID YouTube *</Label>
            <Input id="yt-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
          </div>

          <Button onClick={submit} disabled={loading} className="w-full brand-gradient text-white border-0">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Ajouter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function printNote(title, note) {
  const w = window.open("", "_blank", "width=600,height=700");
  if (!w) return;
  w.document.write(
    "<html><head><title></title><style>body{font-family:Georgia,serif;padding:40px;color:#1a1a1a;line-height:1.7}h1{font-size:20px;margin-bottom:8px}.ref{color:#888;font-size:12px;margin-bottom:24px}pre{white-space:pre-wrap;font-family:inherit;font-size:15px}</style></head><body><h1 id='t'></h1><div class='ref'>CHAY — Note de versets</div><pre id='n'></pre></body></html>"
  );
  w.document.getElementById("t").textContent = title;
  w.document.getElementById("n").textContent = note;
  w.document.close(); w.focus(); w.print();
}