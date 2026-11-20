import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Palette, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { confirmFr } from "@/lib/confirmFr";
import { listerDessins, supprimerDessin } from "@/lib/coloriage";
import { DESSINS } from "@/components/kids/dessins";
import AtelierColoriage from "@/components/kids/AtelierColoriage";

// Section Enfants › Coloriage : « Dessins à colorier » (dessins intégrés + coloriages ajoutés par l'admin)
// et « Mes dessins » (dessins commencés, gardés sur ce téléphone, à continuer).

const svgEnImage = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function Apercu({ blob, alt }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return undefined;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} className="h-full w-full object-contain" /> : null;
}

export default function Coloriage() {
  const [onglet, setOnglet] = useState("dessins");
  const [admin, setAdmin] = useState(null); // coloriages ajoutés par l'admin
  const [mes, setMes] = useState(null);
  const [ouvert, setOuvert] = useState(null); // { source, reprise }

  useEffect(() => {
    let vivant = true;
    base44.entities.Coloriage.list("order", 300)
      .then((r) => { if (vivant) setAdmin((Array.isArray(r) ? r : []).filter((c) => /^https?:\/\//.test(String(c.image_url || "")))); })
      .catch(() => { if (vivant) setAdmin([]); });
    return () => { vivant = false; };
  }, []);

  const chargerMes = useCallback(() => {
    listerDessins().then(setMes).catch(() => setMes([]));
  }, []);
  useEffect(() => { chargerMes(); }, [chargerMes]);

  const sources = useMemo(() => [
    ...DESSINS.map((d) => ({ id: d.id, titre: d.titre, sousTitre: d.histoire, svg: d.svg, image: svgEnImage(d.svg) })),
    ...(admin || []).map((c) => ({ id: `admin-${c.id}`, titre: c.title || "Coloriage", image_url: c.image_url, image: c.thumb_url || c.image_url })),
  ], [admin]);

  /** Dessin de « Mes dessins » -> sa source (dessin intégré, ou coloriage de l'admin). */
  const sourceDe = (d) => {
    if (d.source?.integre) return sources.find((s) => s.id === d.source.id) || null;
    if (d.source?.image_url) return { id: d.source.id, titre: d.source.titre, image_url: d.source.image_url };
    return null;
  };

  const effacer = async (d) => {
    if (!(await confirmFr({ title: "Supprimer ce dessin ?", message: d.titre || "", confirmLabel: "Supprimer" }))) return;
    await supprimerDessin(d.id).catch(() => {});
    chargerMes();
  };

  return (
    <div>
      <div className="mb-5 grid w-full max-w-md grid-cols-2 gap-1 rounded-full border border-border bg-card p-1">
        {[["dessins", "Dessins à colorier"], ["mes", `Mes dessins${mes?.length ? ` (${mes.length})` : ""}`]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setOnglet(id)}
            className={`min-w-0 truncate whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition ${onglet === id ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {onglet === "dessins" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOuvert({ source: s })}
              className="overflow-hidden rounded-2xl border border-border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="aspect-square bg-white p-2">
                <img src={s.image} alt="" loading="lazy" className="h-full w-full object-contain" />
              </div>
              <div className="px-3 py-2">
                <div className="truncate font-display text-sm font-bold">{s.titre}</div>
                {s.sousTitre && <div className="truncate text-xs text-foreground/55">{s.sousTitre}</div>}
              </div>
            </button>
          ))}
          {admin === null && (
            <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-border">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {onglet === "mes" && (
        mes === null ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : !mes.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
            <Palette className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="font-semibold">Pas encore de dessin.</p>
            <p className="mt-1 text-sm text-foreground/60">Choisis un dessin à colorier : il sera gardé ici automatiquement.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {mes.map((d) => {
              const source = sourceDe(d);
              return (
                <div key={d.id} className="relative overflow-hidden rounded-2xl border border-border bg-card">
                  <button
                    type="button"
                    disabled={!source}
                    onClick={() => setOuvert({ source, reprise: d })}
                    className="block w-full text-left disabled:opacity-50"
                    aria-label={`Continuer ${d.titre || "le dessin"}`}
                  >
                    <div className="aspect-square bg-white p-2"><Apercu blob={d.apercu} alt="" /></div>
                    <div className="px-3 py-2">
                      <div className="truncate font-display text-sm font-bold">{d.titre || "Dessin"}</div>
                      <div className="text-xs text-foreground/55">{new Date(d.date).toLocaleDateString("fr-FR")}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => effacer(d)}
                    aria-label="Supprimer ce dessin"
                    className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-background/90 text-destructive shadow"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {ouvert && (
        <AtelierColoriage
          source={ouvert.source}
          reprise={ouvert.reprise}
          onClose={() => { setOuvert(null); chargerMes(); }}
        />
      )}
    </div>
  );
}
