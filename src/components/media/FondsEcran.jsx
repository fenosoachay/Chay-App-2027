import React, { useEffect, useState } from "react";
import { Download, ImageDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerFond, trierFonds, vignetteFond } from "@/lib/fondsEcran";
import GalleryViewer from "./GalleryViewer";
import { useBackHandler } from "@/hooks/useBackHandler";

// Multimédia › « Fond d'écran » : grille de vignettes (format téléphone) ; un toucher ouvre l'aperçu
// dans la visionneuse partagée GalleryViewer (glissement gauche/droite, plein écran).
// Différences avec la Galerie : bouton « Télécharger » (image d'origine, pleine qualité) en haut à droite,
// pas de commentaires, pas de boutons Modifier/Supprimer de la Galerie (les fonds se gèrent dans l'admin).
export default function FondsEcran() {
  const { toast } = useToast();
  const [liste, setListe] = useState(null);
  const [viewerItem, setViewerItem] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let actif = true;
    base44.entities.Wallpaper.list("-created_date", 500)
      .then((rows) => { if (actif) setListe(trierFonds(rows)); })
      .catch(() => { if (actif) setListe([]); });
    return () => { actif = false; };
  }, []);

  useBackHandler(viewerItem !== null, () => setViewerItem(null));

  const enregistrer = async (fond) => {
    setEnvoi(true);
    try {
      const ou = await enregistrerFond(fond);
      toast({ title: ou === "galerie" ? "Enregistré dans la galerie (Images › Chay)" : "Téléchargement lancé" });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };

  if (liste === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  if (!liste.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
        <ImageDown className="mx-auto mb-3 h-8 w-8 text-foreground/40" aria-hidden="true" />
        <p className="font-semibold">Aucun fond d'écran pour le moment.</p>
      </div>
    );
  }

  // Adapter les items Wallpaper au format attendu par GalleryViewer (image_url, id, title, category, created_by_id)
  const itemsForViewer = liste.map((f) => ({
    ...f,
    image_url: vignetteFond(f),
    created_by_id: f.created_by_id,
  }));

  return (
    <>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
        {liste.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setViewerItem(f)}
            className="block aspect-[9/16] overflow-hidden rounded-2xl bg-muted shadow-sm"
            aria-label={`Fond d'écran ${f.title || ""}`.trim()}
          >
            <img src={vignetteFond(f)} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <GalleryViewer
        items={itemsForViewer}
        index={viewerItem ? itemsForViewer.findIndex((i) => i.id === viewerItem.id) : null}
        onClose={() => setViewerItem(null)}
        sansCommentaires
        sansGestion
        actionsHaut={(photo) => {
          // Fichier d'origine (pleine qualité), pas la vignette affichée dans la grille.
          const original = liste.find((f) => f.id === photo.id) || photo;
          return (
            <button
              type="button"
              disabled={envoi}
              onClick={(e) => { e.stopPropagation(); enregistrer(original); }}
              className="h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
              aria-label={`Télécharger ${original.title || "ce fond d'écran"}`}
            >
              {envoi ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            </button>
          );
        }}
      />
    </>
  );
}