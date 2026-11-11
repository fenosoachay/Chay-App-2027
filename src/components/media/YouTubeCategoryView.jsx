import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { AlertTriangle, Lock, LockOpen, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import YouTubeCard from "@/components/media/YouTubeCard";
import YouTubeToolbar from "@/components/media/YouTubeToolbar";
import YouTubeSortableList from "@/components/media/YouTubeSortableList";
import YouTubeEditBar from "@/components/media/YouTubeEditBar";
import YouTubeShuffleBanner from "@/components/media/YouTubeShuffleBanner";
import { clearMediaControl, requestMediaPlayback } from "@/lib/mediaControl";
import { useYoutubePrefs } from "@/hooks/useYoutubePrefs";
import { applySavedOrder, shuffleArray } from "@/lib/youtubePrefs";

const SECTION_LABELS = { culte: "Culte", louange: "Louange", celebration: "Célébration" };

// Miniature YouTube par défaut (utilisée pour détecter les vidéos supprimées).
function ytThumbUrl(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

// Détection des vidéos supprimées/introuvables sur YouTube : la miniature
// renvoie une image placeholder gris clair (120x90), sinon une vignette colorée.
function isDeletedThumbnail(src) {
  return new Promise((resolve) => {
    if (!src || !/^https:\/\/img\.youtube\.com\//.test(src)) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth <= 120 && img.naturalHeight <= 90);
    img.onerror = () => resolve(true);
    img.src = src;
  });
}

// Ligne admin : miniature (ou indicateur "vidéo supprimée"), titre et bouton
// de suppression définitive — visible uniquement pour les admins.
function YouTubeAdminRow({ video, dead, onDelete }) {
  const thumb = video.cover_url || video.thumbnail_url || ytThumbUrl(video.youtube_id);
  return (
    <>
      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
        {dead === undefined ? (
          <div className="absolute inset-0 animate-pulse bg-foreground/10" />
        ) : dead ? (
          <div className="absolute inset-0 grid place-items-center bg-muted text-amber-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
        ) : (
          <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold">{video.title}</p>
        {dead && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600">
            <AlertTriangle className="h-3 w-3" /> Vidéo supprimée
          </span>
        )}
      </div>
      {dead && (
        <button
          type="button"
          onClick={onDelete}
          title="Supprimer ce lien définitivement"
          aria-label={`Supprimer le lien ${video.title}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 active:scale-90"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

export default function YouTubeCategoryView({ section, youtube = [], targetVideoId }) {
  const [playingId, setPlayingId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { prefs, update } = useYoutubePrefs();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Gestion admin : cadenas de réorganisation + liste des liens complets
  // (sans limite de pagination) + statut de suppression des vidéos.
  const [adminLinks, setAdminLinks] = useState([]);
  const [ytLocked, setYtLocked] = useState(true);
  const [deadStatus, setDeadStatus] = useState({}); // id -> true/false ("vidéo supprimée")

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    // TOUS les liens, sans limite de pagination (les anciens inclus).
    base44.entities.YouTubeVideo.list("-created_date")
      .then((list) => { if (!cancelled) setAdminLinks(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin]);

  const refreshAdminLinks = async () => {
    try {
      const list = await base44.entities.YouTubeVideo.list("-created_date");
      if (Array.isArray(list)) setAdminLinks(list);
    } catch {
      /* erreur réseau : on garde la liste courante */
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    const ids = [...new Set(adminLinks.map((y) => y.id).filter((id) => !(id in deadStatus)))];
    if (!ids.length) return;
    let cancelled = false;
    ids.forEach((id) => {
      const link = adminLinks.find((y) => y.id === id);
      if (!link) return;
      isDeletedThumbnail(link.cover_url || link.thumbnail_url || ytThumbUrl(link.youtube_id)).then((dead) => {
        if (!cancelled) setDeadStatus((prev) => ({ ...prev, [id]: dead }));
      });
    });
    return () => { cancelled = true; };
  }, [isAdmin, adminLinks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Les liens ajoutés pendant cette session (formulaire d'ajout inchangé)
  // rejoignent la liste admin dès qu'ils arrivent dans les données.
  useEffect(() => {
    if (!isAdmin || !youtube.length) return;
    setAdminLinks((prev) => {
      const known = new Set(prev.map((y) => y.id));
      const extras = youtube.filter((y) => !known.has(y.id));
      return extras.length ? [...prev, ...extras] : prev;
    });
  }, [isAdmin, youtube]);

  const deleteLink = async (id) => {
    try {
      await base44.entities.YouTubeVideo.delete(id);
      await refreshAdminLinks();
      setDeadStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      // erreur réseau : on retire au moins le lien de l'affichage
      setAdminLinks((items) => items.filter((y) => y.id !== id));
    }
  };

  const [shuffled, setShuffled] = useState(null); // ordre aléatoire courant (ids)
  const [finished, setFinished] = useState(false);
  const [pulse, setPulse] = useState(false);
  const shuffleRef = useRef(null);

  const baseItems = useMemo(
    () => youtube.filter((y) => (y.section || "culte") === section),
    [youtube, section]
  );
  const customItems = useMemo(
    () => applySavedOrder(baseItems, prefs.playlist_orders[section]),
    [baseItems, prefs.playlist_orders, section]
  );
  const shuffleOn = Boolean(prefs.shuffle_modes[section]);
  const locked = prefs.playlist_locks[section] !== false; // verrouillée par défaut
  const editing = !locked; // cadenas ouvert = réorganisation active

  // File de lecture : ordre aléatoire courant si actif, sinon ordre personnalisé.
  const queueItems = useMemo(() => {
    if (shuffleOn && shuffled) {
      const byId = new Map(customItems.map((v) => [v.id, v]));
      const ordered = shuffled.map((id) => byId.get(id)).filter(Boolean);
      customItems.forEach((v) => { if (!shuffled.includes(v.id)) ordered.push(v); });
      return ordered;
    }
    return customItems;
  }, [customItems, shuffleOn, shuffled]);
  shuffleRef.current = { shuffleOn };

  const stopUrlVideo = useCallback(() => {
    if (location.pathname === "/media" && searchParams.has("video")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("video");
      setSearchParams(nextParams, { replace: true });
    }
  }, [location.pathname, searchParams, setSearchParams]);

  const playQueue = useCallback((list, index) => {
    const item = list[index];
    if (!item?.youtube_id) return;
    setFinished(false);
    let id;
    const stop = () => {
      clearMediaControl(id);
      setPlayingId(null);
      stopUrlVideo();
    };
    const hasNext = index < list.length - 1;
    id = requestMediaPlayback({
      type: "youtube",
      engine: "youtube",
      title: item.title || "Vidéo YouTube",
      subtitle: `${SECTION_LABELS[section] || section}${shuffleRef.current?.shuffleOn ? " · Aléatoire" : ""}`,
      artwork: item.thumbnail_url || item.cover_url || `https://img.youtube.com/vi/${item.youtube_id}/hqdefault.jpg`,
      source: item.youtube_id,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: 0,
      isLive: false,
      previous: index > 0 ? () => playQueue(list, index - 1) : null,
      // Fin de liste en mode aléatoire : on propose de recommencer.
      next: hasNext
        ? () => playQueue(list, index + 1)
        : shuffleRef.current?.shuffleOn
          ? () => { stop(); setFinished(true); }
          : null,
      queue: list.map((entry) => ({
        id: entry.id,
        title: entry.title,
        source: entry.youtube_id,
        artwork: entry.thumbnail_url || entry.cover_url || null,
      })),
      queueIndex: index,
      stop,
    }, "youtube");
    setPlayingId(item.id);
  }, [section, stopUrlVideo]);

  const startVideoAt = useCallback((index) => {
    playQueue(queueItems, index);
  }, [playQueue, queueItems]);

  useEffect(() => {
    if (!targetVideoId) return;
    const targetIndex = queueItems.findIndex((video) => video.id === targetVideoId);
    if (targetIndex >= 0) startVideoAt(targetIndex);
    else setPlayingId(null);
  }, [targetVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startShuffle = () => {
    const order = shuffleArray(customItems).map((v) => v.id);
    const byId = new Map(customItems.map((v) => [v.id, v]));
    const list = order.map((id) => byId.get(id));
    setShuffled(order);
    setFinished(false);
    shuffleRef.current = { shuffleOn: true };
    playQueue(list, 0);
  };

  const toggleShuffle = () => {
    if (shuffleOn) {
      update("shuffle_modes", section, false);
      setShuffled(null);
      setFinished(false);
      return;
    }
    update("shuffle_modes", section, true);
    setPulse(true);
    setTimeout(() => setPulse(false), 700);
    startShuffle();
  };


  // Chaque déplacement est enregistré tout de suite (plus de bouton « Enregistrer »).
  const reorder = (next) => update("playlist_orders", section, next.map((v) => v.id));
  const resetOrder = () => update("playlist_orders", section, undefined);
  const toggleLock = () => update("playlist_locks", section, !locked);

  const shown = editing ? customItems : queueItems;
  const playingIndex = shown.findIndex((v) => v.id === playingId);

  // ── Gestion admin : les 3 catégories YouTube (Culte, Louange, Célébration)
  // sont affichées dans des sections distinctes, avec TOUS les liens (anciens
  // inclus, sans limite de pagination), même si la vidéo a été supprimée de
  // YouTube. Un cadenas active le glisser-déposer pour réorganiser ; quand il
  // est verrouillé, l'ordre est figé. Les liens "vidéo supprimée" peuvent être
  // retirés définitivement de la base via le bouton Supprimer.
  if (isAdmin) {
    const orderOf = (id) => (prefs.playlist_orders[id] || []);
    const bySection = Object.keys(SECTION_LABELS).map((sec) => {
      const items = adminLinks.filter((y) => (y.section || "culte") === sec);
      return {
        sec,
        items: applySavedOrder(items, orderOf(sec)),
        locked: ytLocked,
      };
    });

    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-primary">Gestion admin — toutes les sections YouTube</p>
          <button
            type="button"
            onClick={() => setYtLocked((prev) => !prev)}
            title={ytLocked
              ? "Liste verrouillée. Cliquez sur le cadenas pour réorganiser."
              : "Liste déverrouillée. Glissez les liens pour réorganiser."}
            aria-label={ytLocked ? "Déverrouiller la réorganisation" : "Verrouiller la réorganisation"}
            aria-pressed={!ytLocked}
            className={`inline-flex h-11 w-11 place-items-center rounded-full border transition active:scale-90 ${
              ytLocked ? "border-border bg-card text-foreground/70" : "border-primary bg-primary/10 text-primary"
            }`}
          >
            {ytLocked
              ? <Lock key="lock" className="h-5 w-5 animate-float-in" />
              : <LockOpen key="unlock" className="h-5 w-5 animate-float-in" />}
          </button>
        </div>

        {bySection.map(({ sec, items, locked: sectionLocked }) => (
          <section key={sec} aria-labelledby={`yt-admin-${sec}`}>
            <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3">
              <h2 id={`yt-admin-${sec}`} className="font-bold text-base">{SECTION_LABELS[sec]}</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                {items.length} lien{items.length > 1 ? "s" : ""}
              </span>
            </div>

            {!sectionLocked && items.length > 1 && (
              <YouTubeEditBar onReset={() => update("playlist_orders", sec, undefined)} />
            )}

            {items.length ? (
              sectionLocked ? (
                <ul className="space-y-2">
                  {items.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2"
                    >
                      <YouTubeAdminRow
                        video={v}
                        dead={deadStatus[v.id]}
                        onDelete={() => deleteLink(v.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <YouTubeSortableList
                  items={items}
                  onReorder={(next) => update("playlist_orders", sec, next.map((x) => x.id))}
                  renderRow={(v) => (
                    <YouTubeAdminRow
                      video={v}
                      dead={deadStatus[v.id]}
                      onDelete={() => deleteLink(v.id)}
                    />
                  )}
                />
              )
            ) : (
              <p className="text-foreground/50 text-sm">Aucun lien dans cette section.</p>
            )}
          </section>
        ))}
      </div>
    );
  }

  // ── Vue utilisateur normal : inchangée (liste de la section courante).
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-foreground/55">
          Vidéos YouTube — {SECTION_LABELS[section] || section}.
        </p>
      </div>

      <YouTubeToolbar
        locked={locked}
        shuffleOn={shuffleOn}
        pulse={pulse}
        disabled={!customItems.length}
        onToggleShuffle={toggleShuffle}
        onToggleLock={toggleLock}
      />

      <YouTubeShuffleBanner
        shuffleOn={shuffleOn}
        finished={finished}
        onRestart={startShuffle}
        onDismiss={() => setFinished(false)}
      />

      {shown.length ? (
        editing ? (
          <>
            <YouTubeEditBar onReset={resetOrder} />
            <YouTubeSortableList items={customItems} onReorder={reorder} />
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {shown.map((y, i) => (
              <YouTubeCard
                key={y.id}
                video={y}
                index={i}
                playingIndex={playingIndex}
                onPlay={startVideoAt}
              />
            ))}
          </div>
        )
      ) : (
        <p className="text-foreground/50 text-sm">Aucune vidéo pour le moment.</p>
      )}
      {targetVideoId && !baseItems.some((video) => video.id === targetVideoId) && (
        <p role="status" className="mt-4 text-sm text-foreground/60">
          Cette vidéo n'est plus disponible dans cette section.
        </p>
      )}
    </div>
  );
}