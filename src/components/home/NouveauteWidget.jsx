import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, History, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ContentDetailDialog from "./ContentDetailDialog";
import { getContentMediaPath } from "@/lib/contentLinks";
import { getHomeContentMessage } from "@/lib/homeContentMessage";

// Panneau (gauche « Préc. » ou droite « Nouv. ») du widget de nouveautés.
function Pane({ label, icon: Icon, item, isLatest, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      disabled={!item}
      className={`flex-1 p-3 text-left flex flex-col justify-between min-h-[9rem] relative group transition-colors duration-300 ${
        isLatest ? "bg-primary/5 border-l border-border" : "bg-card hover:bg-muted/30"
      } disabled:opacity-50 disabled:cursor-default`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-3 w-3 ${isLatest ? "text-primary" : "text-foreground/40"}`} />
        <span className={`text-[0.65rem] font-bold uppercase tracking-wider ${isLatest ? "text-primary" : "text-foreground/50"}`}>
          {label}
        </span>
      </div>

      {item ? (
        <>
          <p className="selectable text-[0.75rem] leading-tight text-foreground/90 line-clamp-none">
            {getHomeContentMessage(item)}
          </p>
          <div className={`mt-auto pt-2 flex items-center gap-1 text-xs font-semibold ${isLatest ? "justify-end text-primary" : "justify-start text-foreground/60"}`}>
            {isLatest ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
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
 */
export default function NouveauteWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    base44.entities.Content
      .filter({ status: "published" }, "-published_at", 5)
      .then((list) => setItems(Array.isArray(list) ? list : []))
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
        <Pane label="Nouv." icon={Sparkles} item={items[0] || null} isLatest onOpen={open} />
      </div>

      <ContentDetailDialog
        item={active}
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
      />
    </section>
  );
}