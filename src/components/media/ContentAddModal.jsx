import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import RichTextEditor from "@/components/media/RichTextEditor";
import CroppableUploader from "@/components/media/CroppableUploader";

const TYPES = [
  { id: "article", label: "Article", icon: FileText },
  { id: "gallery", label: "Galerie", icon: ImageIcon },
];

export default function ContentAddModal({ open, onOpenChange, onSaved }) {
  const { toast } = useToast();
  const [type, setType] = useState("article");
  const [loading, setLoading] = useState(false);

  const [article, setArticle] = useState({ title: "", excerpt: "", body: "", cover_url: "", category: "", author: "" });
  const [galleryUrl, setGalleryUrl] = useState("");

  const reset = () => {
    setArticle({ title: "", excerpt: "", body: "", cover_url: "", category: "", author: "" });
    setGalleryUrl("");
  };

  const submit = async () => {
    setLoading(true);
    try {
      if (type === "article") {
        if (!article.title.trim() || !article.body.trim()) {
          toast({ title: "Titre et contenu requis", variant: "destructive" });
          setLoading(false);
          return;
        }
        await base44.entities.Article.create(article);
      } else {
        if (!galleryUrl.trim()) {
          toast({ title: "Image requise", variant: "destructive" });
          setLoading(false);
          return;
        }
        await base44.entities.GalleryImage.create({ image_url: galleryUrl });
      }
      toast({ title: "Contenu ajouté" });
      reset();
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter du contenu</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-5">
          {TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`flex-1 inline-flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold transition ${
                  type === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/60 hover:bg-muted"
                }`}
              >
                <Icon className="h-5 w-5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {type === "article" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titre *</Label>
              <Input value={article.title} onChange={(e) => setArticle({ ...article, title: e.target.value })} placeholder="Titre de l'article" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Auteur</Label>
                <Input value={article.author} onChange={(e) => setArticle({ ...article, author: e.target.value })} placeholder="Auteur" />
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Input value={article.category} onChange={(e) => setArticle({ ...article, category: e.target.value })} placeholder="Ex. Enseignement" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Image de couverture</Label>
              <CroppableUploader value={article.cover_url} onChange={(v) => setArticle({ ...article, cover_url: v })} aspect={16 / 9} allowOriginal crop />
            </div>
            <div className="space-y-1.5">
              <Label>Extrait</Label>
              <Textarea value={article.excerpt} onChange={(e) => setArticle({ ...article, excerpt: e.target.value })} placeholder="Résumé court…" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Contenu *</Label>
              <RichTextEditor value={article.body} onChange={(v) => setArticle({ ...article, body: v })} placeholder="Rédigez votre article…" />
            </div>
          </div>
        )}

        {type === "gallery" && (
          <div className="space-y-3">
            <p className="text-sm text-foreground/55">Importez une ou plusieurs images. Aucun titre requis — les images s'affichent en carré, cliquables en taille réelle.</p>
            <div className="space-y-1.5">
              <Label>Image *</Label>
              <CroppableUploader value={galleryUrl} onChange={setGalleryUrl} aspect={1} crop label="une image" />
            </div>
          </div>
        )}

        <Button className="w-full mt-4" onClick={submit} disabled={loading}>
          {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement…</>) : "Publier"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}