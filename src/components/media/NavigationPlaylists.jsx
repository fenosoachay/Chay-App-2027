import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Lock, Unlock } from "lucide-react";
import GrillePlaylists from "@/components/media/GrillePlaylists";
import ListeTriable from "@/components/media/ListeTriable";
import PlaylistCover from "@/components/media/PlaylistCover";
import { useBackHandler } from "@/hooks/useBackHandler";
import { arbrePlaylists, contenusDe, idsSousPlaylists, liensDe } from "@/lib/playlistsArbre";

/**
 * Navigation membre d'une section (YouTube, Articles, Galerie) : Section > Playlist > Sous-playlist > contenus,
 * au style de Musique. `children` = affichage d'avant, pour les contenus « Non classés » (toujours visibles).
 *  - renderContenus(sousPlaylist, contenus) : contenus d'une sous-playlist, dans l'ordre choisi par l'admin ;
 *  - onChargerManquants(ids) : charge les contenus d'une sous-playlist absents des listes déjà chargées ;
 *  - cibleId : contenu visé par un lien / une notification -> sa sous-playlist s'ouvre ;
 *  - onReorderLiens(sousPlaylistId, contenus) : ordre des contenus (admin, cadenas ouvert).
 */
export default function NavigationPlaylists({
  categorie, playlists, playlistTracks, contenus, nbNonClasses, isAdmin,
  renderContenus, onChargerManquants, cibleId, onReorderLiens, vignette, children,
}) {
  const arbre = useMemo(() => arbrePlaylists(playlists, categorie), [playlists, categorie]);
  const [parent, setParent] = useState(null);
  const [sous, setSous] = useState(null);
  const [verrou, setVerrou] = useState(true);

  // Contenu visé : on ouvre sa sous-playlist (et sa playlist).
  useEffect(() => {
    if (!cibleId) return;
    const valides = idsSousPlaylists(arbre);
    const lien = (playlistTracks || []).find((t) => t.track_id === cibleId && valides.has(t.playlist_id));
    if (!lien) return;
    const p = arbre.find((x) => x.sous.some((s) => s.id === lien.playlist_id));
    setParent(p || null);
    setSous(p?.sous.find((s) => s.id === lien.playlist_id) || null);
  }, [cibleId, arbre, playlistTracks]);

  const contenusSous = useMemo(
    () => (sous ? contenusDe(sous.id, playlistTracks, contenus) : []),
    [sous, playlistTracks, contenus]
  );

  // Contenus d'une sous-playlist pas encore chargés (listes paginées) : chargés par leur id.
  useEffect(() => {
    if (!sous) return;
    const connus = new Set((contenus || []).map((c) => c.id));
    const manquants = liensDe(sous.id, playlistTracks).map((t) => t.track_id).filter((id) => !connus.has(id));
    if (manquants.length) onChargerManquants?.(manquants);
  }, [sous, playlistTracks]); // eslint-disable-line react-hooks/exhaustive-deps

  const retour = () => {
    if (sous) setSous(null);
    else setParent(null);
  };
  // Bouton retour d'Android : une entrée d'historique par niveau ouvert (sous-playlist -> playlist -> section).
  useBackHandler(Boolean(parent), () => { setSous(null); setParent(null); });
  useBackHandler(Boolean(sous), () => setSous(null));

  const enTete = (titre) => (
    <div className="flex items-center gap-3 mb-5">
      <button
        type="button"
        onClick={retour}
        aria-label="Retour"
        className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h3 className="font-display font-extrabold text-2xl truncate flex-1">{titre}</h3>
      {sous && isAdmin && contenusSous.length > 1 && (
        <button
          type="button"
          onClick={() => setVerrou((v) => !v)}
          aria-pressed={!verrou}
          aria-label={verrou ? "Déverrouiller pour réorganiser" : "Verrouiller l'ordre"}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
            verrou ? "border-border bg-card text-muted-foreground hover:bg-muted" : "border-primary bg-primary/10 text-primary"
          }`}
        >
          {verrou ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        </button>
      )}
    </div>
  );

  if (sous) {
    return (
      <div>
        {enTete(sous.name)}
        {!contenusSous.length ? (
          <p className="text-foreground/50 text-sm">Aucun contenu dans cette sous-playlist pour le moment.</p>
        ) : isAdmin && !verrou ? (
          <ListeTriable
            id={`contenus-${sous.id}`}
            items={contenusSous}
            onReorder={(next) => onReorderLiens?.(sous.id, next)}
            renderRow={(c) => (
              <>
                <PlaylistCover playlist={{ cover_url: vignette?.(c), name: c.title }} className="h-10 w-10 shrink-0 rounded-[10px]" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.title || "Sans titre"}</span>
              </>
            )}
          />
        ) : (
          renderContenus(sous, contenusSous)
        )}
      </div>
    );
  }

  if (parent) {
    const sp = arbre.find((p) => p.id === parent.id)?.sous || [];
    return (
      <div>
        {enTete(parent.name)}
        {sp.length ? (
          <GrillePlaylists id={`sous-${parent.id}`} items={sp} onOuvrir={setSous} />
        ) : (
          <p className="text-foreground/50 text-sm">Aucune sous-playlist pour le moment.</p>
        )}
      </div>
    );
  }

  // Aucune playlist encore : l'affichage d'avant, inchangé.
  if (!arbre.length) return children;

  return (
    <div>
      <GrillePlaylists id={`playlists-${categorie}`} items={arbre} onOuvrir={setParent} />
      {nbNonClasses > 0 && (
        <div className="mt-8">
          <h3 className="font-display font-extrabold text-lg mb-3">Non classés</h3>
          {children}
        </div>
      )}
    </div>
  );
}
