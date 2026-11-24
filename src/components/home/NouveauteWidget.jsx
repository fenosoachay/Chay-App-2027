import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, History, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ContentDetailDialog from "./ContentDetailDialog";
import { getContentMediaPath } from "@/lib/contentLinks";
import { getHomeContentMessage } from "@/lib/homeContentMessage";

// Tous les types de contenu multimédia à inclure dans "Nouv."
const MEDIA_TYPES = [
  "audio",
  "predication",
  "video",
  "youtube",
  "article",
  "gallery",
  "wallpaper"
];

// Panneau (gauche « Préc. » ou droite « Nouv. ») du widget de nouveautés.
// blink = true (panneau « Nouv. » uniquement) fait clignoter le libellé et son
// icône pour attirer l'œil sur la nouveauté (voir .blink-label dans index.css).
function Pane({ label, icon: Icon, item, isLatest, blink = false, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      disabled={!item}
      className={`flex-1 p-3 text-left flex flex-col relative group transition-colors duration-300 ${
        isLatest ? "bg-primary/5 border-l border-border" : "bg-card hover:bg-muted/30"
      } disabled:opacity-50 disabled:cursor-default`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-3 w-3 ${isLatest ? "text-primary" : "text-foreground/40"} ${blink ? "blink-label" : ""}`} />
        <span className={`text-[0.65rem] font-bold uppercase tracking-wider ${isLatest ? "text-primary" : "text-foreground/50"} ${blink ? "blink-label" : ""}`}>
          {label}
        </span>
      </div>

      {item ? (
        <>
          <p className="selectable text-[0.75rem] leading-tight text-foreground/90 line-clamp-none">
            {getHomeContentMessage(item)}
          </p>
          {/* Flèche 3,78 px sous la phrase : « Préc. » alignée à gauche (sur l'icône et la phrase),
              « Nouv. » alignée à droite. -5px : la flèche dessinée a une marge intérieure, on l'aligne sur le trait. */}
          <div className={`mt-[3.78px] flex ${isLatest ? "justify-end" : "justify-start"}`}>
            {isLatest
              ? <ChevronRight className="-mr-[5px] h-4 w-4" />
              : <ChevronLeft className="-ml-[5px] h-4 w-4" />}
          </div>
        </>
      ) : (
        <p className="text-sm text-foreground/40 italic">Aucun contenu</p>
      )}
    </button>
  );
}

/**
 * Widget Nouveauté / Précédemment : affichage côte à côte des deux derniers contenus publiés.
 * Inclut toutes les sections multimédia : Musique, Prédication, Films, YouTube, Galerie,
 * Articles, Vidéos, Fonds d'écran — y compris contenus datés dans le futur.
 */
export default function NouveauteWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    base44.entities.Content
      .filter({ status: "published" }, "-published_at", 10)
      .then((list) => {
        const filtered = Array.isArray(list) ? list.filter((c) => MEDIA_TYPES.includes(c.type)) : [];
        setItems(filtered);
      })
      .catch(() => setItems([]));
  }, []);

  const open = (c) => {
    if (!c) return;
    const path = getContentMediaPath(c);
    if (path) navigate(path);
    else setActive(c);
  };

  return (
    <section className="mt-6 animate-float-in">
      <div className="rounded-[1.5rem] border border-border bg-card overflow-hidden grid grid-cols-2 divide-x divide-border shadow-sm">
        <Pane label="Préc." icon={History} item={items[1] || null} isLatest={false} onOpen={open} />
        <Pane label="Nouv." icon={Sparkles} item={items[0] || null} isLatest blink onOpen={open} />
      </div>

      <ContentDetailDialog
        item={active}
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
      />
    </section>
  );
}