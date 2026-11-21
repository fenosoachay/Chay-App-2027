import React, { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { DESSINS } from "@/components/kids/dessins";
import { definirMasque, lireMasques } from "@/lib/jeuxEnfants";
import { useToast } from "@/components/ui/use-toast";

// Admin › Enfants › Coloriages : les 8 dessins intégrés à l'application, à masquer ou réafficher
// (les dessins ajoutés par l'admin se gèrent juste en dessous : ajouter, modifier, supprimer).
const svgEnImage = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export default function DessinsIntegres() {
  const { toast } = useToast();
  const [masques, setMasques] = useState(null);
  const [occupe, setOccupe] = useState("");

  useEffect(() => { lireMasques("coloriage").then(setMasques).catch(() => setMasques(new Set())); }, []);

  const basculer = async (id) => {
    const cache = !masques.has(id);
    setOccupe(id);
    try {
      await definirMasque("coloriage", id, cache);
      setMasques((m) => { const n = new Set(m); if (cache) n.add(id); else n.delete(id); return n; });
    } catch (e) {
      toast({ title: "Non enregistré", description: e?.message, variant: "destructive" });
    } finally {
      setOccupe("");
    }
  };

  return (
    <div className="mb-6 rounded-[1.5rem] border border-border bg-card p-4">
      <p className="font-bold">Dessins intégrés à l'application</p>
      <p className="mb-3 text-sm text-foreground/60">Touchez un dessin pour le masquer ou le réafficher chez les enfants.</p>
      {masques === null ? (
        <div className="grid h-24 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DESSINS.map((d) => {
            const cache = masques.has(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => basculer(d.id)}
                disabled={occupe === d.id}
                className={`overflow-hidden rounded-2xl border text-left transition ${cache ? "border-dashed border-border opacity-50" : "border-border"}`}
              >
                <div className="aspect-square bg-white p-2">
                  <img src={svgEnImage(d.svg)} alt={d.titre} className="h-full w-full object-contain" />
                </div>
                <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
                  {occupe === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : cache ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-emerald-500" />}
                  <span className="min-w-0 flex-1 truncate">{d.titre}</span>
                  <span className="text-xs text-foreground/50">{cache ? "Masqué" : "Visible"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
