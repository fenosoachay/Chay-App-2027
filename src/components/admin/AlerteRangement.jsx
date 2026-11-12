import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SECTIONS_RANGEES, arbrePlaylists, contenusNonRanges } from "@/lib/playlistsArbre";

const APERCU = 8;

/** Contenus à ranger, par section (charge tout : contenus, playlists, liens). Exporté pour les tests. */
export async function chargerNonRanges(entities) {
  const [playlists, liens] = await Promise.all([
    entities.Playlist.list("-created_date", 2000).catch(() => []),
    entities.PlaylistTrack.list("-created_date", 20000, 0, ["id", "playlist_id", "track_id"]).catch(() => []),
  ]);
  return Promise.all(
    SECTIONS_RANGEES.map(async (s) => {
      const contenus = await entities[s.entite].list("-created_date", 20000, 0, ["id", "title"]).catch(() => []);
      const restants = contenusNonRanges(contenus, liens, arbrePlaylists(playlists, s.categorie));
      return { ...s, total: Array.isArray(contenus) ? contenus.length : 0, restants };
    })
  );
}

// Alerte du panneau admin : ce qui reste à ranger dans une sous-playlist, section par section.
// Ces contenus restent visibles pour les membres (rubrique « Non classés ») ; un clic ouvre la section admin.
export default function AlerteRangement({ onNavigate }) {
  const [sections, setSections] = useState(null);

  useEffect(() => {
    let actif = true;
    chargerNonRanges(base44.entities).then((r) => { if (actif) setSections(r); }).catch(() => {});
    return () => { actif = false; };
  }, []);

  const aRanger = (sections || []).filter((s) => s.restants.length);
  if (!aRanger.length) return null;
  const total = aRanger.reduce((n, s) => n + s.restants.length, 0);

  return (
    <section role="status" className="mt-6 rounded-[1.5rem] border border-amber-500/40 bg-amber-500/10 p-5">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
        <h3 className="font-display font-extrabold text-lg">
          {total} contenu{total > 1 ? "s" : ""} à ranger dans une sous-playlist
        </h3>
      </div>
      <p className="text-sm text-foreground/60 mb-4">
        Ils restent visibles pour les membres (rubrique « Non classés »). Ouvrez la section, puis modifiez chaque
        contenu pour choisir sa sous-playlist.
      </p>
      <div className="space-y-3">
        {aRanger.map((s) => (
          <div key={s.entite} className="rounded-2xl border border-border bg-card p-3">
            <button
              type="button"
              onClick={() => onNavigate?.(s.entite)}
              className="flex w-full items-center justify-between gap-2 text-left font-bold"
            >
              <span>
                {s.label} : {s.restants.length} sur {s.total}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
            <ul className="mt-2 space-y-0.5 text-sm text-foreground/70">
              {s.restants.slice(0, APERCU).map((c) => (
                <li key={c.id} className="truncate">• {c.title || "Sans titre"}</li>
              ))}
              {s.restants.length > APERCU && (
                <li className="text-foreground/50">… et {s.restants.length - APERCU} autre{s.restants.length - APERCU > 1 ? "s" : ""}</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
