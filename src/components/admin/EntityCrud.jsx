import React, { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { notifyAdminUpload } from "@/lib/adminNotify";
import { confirmFr } from "@/lib/confirmFr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Lock, Unlock, GripVertical } from "lucide-react";
import { Image } from "@/components/ui/image";
import EntityForm from "@/components/admin/EntityForm";
import CreatePlaylistModal from "@/components/media/CreatePlaylistModal";
import PlaylistCover from "@/components/media/PlaylistCover";
import {
  buildPlaylistTrackRecord,
  resolveSelectedPlaylistId,
  savePlaylistTrack,
} from "@/lib/playlistAttachment";

const PLAYLIST_CATEGORY = {
  MusicTrack: "music",
  Sermon: "sermons",
  Video: "films",
};

/* ─── Hook drag & drop tactile + souris ─────────────────────────────────── */
function useDragSort(items, onReorder) {
  const dragIdx = useRef(null);
  const listRef = useRef(null);

  const getItemEls = () =>
    listRef.current ? Array.from(listRef.current.children) : [];

  const indexFromY = (clientY) => {
    const els = getItemEls();
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return els.length - 1;
  };

  /* ── souris ── */
  const onMouseDown = useCallback(
    (idx) => (e) => {
      e.preventDefault();
      dragIdx.current = idx;
      const els = getItemEls();
      els[idx]?.classList.add("opacity-50", "scale-[0.98]");

      const onMove = (me) => {
        const target = indexFromY(me.clientY);
        els.forEach((el, i) => {
          el.style.transform = "";
          if (i === dragIdx.current) return;
          if (
            dragIdx.current < target
              ? i > dragIdx.current && i <= target
              : i < dragIdx.current && i >= target
          ) {
            el.style.transform =
              dragIdx.current < target ? "translateY(-56px)" : "translateY(56px)";
          }
        });
      };

      const onUp = (me) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const from = dragIdx.current;
        dragIdx.current = null;
        els.forEach((el) => {
          el.classList.remove("opacity-50", "scale-[0.98]");
          el.style.transform = "";
        });
        const to = indexFromY(me.clientY);
        if (from !== to) {
          const next = [...items];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          onReorder(next);
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [items, onReorder]
  );

  /* ── tactile ── */
  const onTouchStart = useCallback(
    (idx) => (e) => {
      dragIdx.current = idx;
      const els = getItemEls();
      els[idx]?.classList.add("opacity-50", "scale-[0.98]");

      const onMove = (te) => {
        te.preventDefault();
        const touch = te.touches[0];
        const target = indexFromY(touch.clientY);
        els.forEach((el, i) => {
          el.style.transform = "";
          if (i === dragIdx.current) return;
          if (
            dragIdx.current < target
              ? i > dragIdx.current && i <= target
              : i < dragIdx.current && i >= target
          ) {
            el.style.transform =
              dragIdx.current < target ? "translateY(-56px)" : "translateY(56px)";
          }
        });
      };

      const onEnd = (te) => {
        listRef.current?.removeEventListener("touchmove", onMove);
        listRef.current?.removeEventListener("touchend", onEnd);
        const from = dragIdx.current;
        dragIdx.current = null;
        els.forEach((el) => {
          el.classList.remove("opacity-50", "scale-[0.98]");
          el.style.transform = "";
        });
        const touch = te.changedTouches[0];
        const to = indexFromY(touch.clientY);
        if (from !== to) {
          const next = [...items];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          onReorder(next);
        }
      };

      listRef.current?.addEventListener("touchmove", onMove, { passive: false });
      listRef.current?.addEventListener("touchend", onEnd);
    },
    [items, onReorder]
  );

  return { listRef, onMouseDown, onTouchStart };
}

/* ─── Cadenas ──────────────────────────────────────────────────────────── */
function LockToggle({ locked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l'ordre"}
      aria-label={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l'ordre"}
      aria-pressed={!locked}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition
        ${locked
          ? "border-border bg-card text-muted-foreground hover:bg-muted"
          : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
        }`}
    >
      {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ─── Composant principal ───────────────────────────────────────────────── */
export default function EntityCrud({
  entity,
  fields,
  listColumns,
  sort,
  readOnly,
  detailField,
  emptyLabel,
  thumbField,
  playlistField = "cover_url",
  showPlaylist = false,
}) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [retryingPlaylistAttachment, setRetryingPlaylistAttachment] = useState(false);
  const [formKey, setFormKey] = useState("new");
  const pendingSelectRef = useRef(null);
  const selectedPlaylistRef = useRef(null);
  const pendingPlaylistAttachmentRef = useRef(null);

  /* cadenas playlists / musiques */
  const [playlistsLocked, setPlaylistsLocked] = useState(true);
  const [tracksLocked, setTracksLocked] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await base44.entities[entity]
      .list(sort || "-created_date", 50)
      .catch(() => []);
    setItems(Array.isArray(res) ? res : []);
    setLoading(false);
  };

  const loadPlaylists = async () => {
    try {
      const list = await base44.entities.Playlist.list("-created_date", 100);
      const arr = Array.isArray(list) ? list : [];
      arr.sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) ||
          new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()
      );
      const cat = PLAYLIST_CATEGORY[entity];
      setPlaylists(cat ? arr.filter((p) => (p.category || "music") === cat) : arr);
    } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (showPlaylist) loadPlaylists(); }, [showPlaylist]);

  const allFields = showPlaylist
    ? [
        {
          name: "playlist_id",
          label: "Playlist",
          type: "select",
          required: !editing,
          options: [
            ...(editing ? [{ value: "", label: "— Aucune (retirer de la playlist)" }] : []),
            ...playlists.map((p) => ({ value: p.id, label: p.name })),
          ],
        },
        ...fields,
      ]
    : fields;

  /* ── Sauvegarde ordre playlists ── */
  const handleReorderPlaylists = useCallback(async (next) => {
    setPlaylists(next);
    // Ne plus avaler l'échec : Base44 rejette silencieusement l'écriture d'un
    // champ absent de l'entité déployée, et l'ordre réapparaissait à sa place.
    const results = await Promise.all(
      next.map((p, i) =>
        base44.entities.Playlist.update(p.id, { order: i }).then(
          () => true,
          () => false
        )
      )
    );
    if (results.includes(false)) {
      await loadPlaylists();
      toast({
        title: "Réorganisation non enregistrée",
        description:
          "Le champ « order » semble absent de l'entité Playlist côté Base44. Ajoutez-le (type nombre) dans Entities → Playlist, puis Publish.",
        variant: "destructive",
      });
    }
  }, [loadPlaylists, toast]);

  /* ── Sauvegarde ordre musiques ── */
  const handleReorderItems = useCallback(async (next) => {
    setItems(next);
    await Promise.all(
      next.map((item, i) =>
        base44.entities[entity].update(item.id, { order: i }).catch(() => {})
      )
    );
  }, [entity]);

  const playlistDrag = useDragSort(playlists, handleReorderPlaylists);
  const itemDrag = useDragSort(items, handleReorderItems);

  /* ── Attach / detach playlist ── */
  const attachToPlaylist = async (
    createdItem,
    playlistId,
    submittedData,
    isRetry = false
  ) => {
    if (!playlistId) return;
    const record = buildPlaylistTrackRecord({
      entity,
      playlistId,
      item: createdItem,
      submittedData,
      coverField: playlistField,
    });
    // A new upload gets a new track ID, so there cannot already be a link for
    // it. Create the playlist relation directly instead of blocking the save
    // on an extra lookup request.
    await savePlaylistTrack(
      base44.entities.PlaylistTrack,
      record,
      entity === "Video" ? "video_url" : "audio_url",
      { checkExisting: isRetry }
    );
  };

  const notifyPlaylistUpload = (item, playlistId) => {
    const kindMap = { MusicTrack: "music", Sermon: "sermon", Video: "film" };
    const kind = kindMap[entity];
    if (!kind) return;
    notifyAdminUpload({
      kind,
      title: item.title,
      artist: item.artist,
      playlist: playlists.find((p) => p.id === playlistId)?.name,
      playlistId,
      contentId: item.id,
    });
  };

  const detachFromPlaylists = async (itemId) => {
    const tracks = await base44.entities.PlaylistTrack.filter(
      { track_id: itemId },
      "-created_date",
      5000
    );
    await Promise.all(
      (Array.isArray(tracks) ? tracks : []).map((track) =>
        base44.entities.PlaylistTrack.delete(track.id)
      )
    );
  };

  const submit = async (data) => {
    setSaving(true);
    try {
      const { playlist_id: submittedPlaylistId, ...rest } = data;
      const playlist_id = resolveSelectedPlaylistId(
        selectedPlaylistRef.current,
        submittedPlaylistId
      );

      if (showPlaylist && !editing && !playlist_id) {
        toast({
          title: "Playlist obligatoire",
          description: "Choisissez la playlist avant d'enregistrer le contenu.",
          variant: "destructive",
        });
        return;
      }

      if (pendingPlaylistAttachmentRef.current) {
        const pending = pendingPlaylistAttachmentRef.current;
        await attachToPlaylist(
          pending.item,
          pending.playlistId,
          pending.data,
          true
        );
        pendingPlaylistAttachmentRef.current = null;
        setRetryingPlaylistAttachment(false);
        if (!editing) notifyPlaylistUpload(pending.item, pending.playlistId);
        toast({ title: "Ajouté à la playlist" });
        setOpen(false);
        await load();
        await loadPlaylists();
        return;
      }

      let createdItem;
      if (editing) {
        createdItem = await base44.entities[entity].update(editing.id, rest);
        await detachFromPlaylists(editing.id);
      } else {
        rest.created_by_admin = true;
        createdItem = await base44.entities[entity].create(rest);
      }

      // Base44 accepts a write and silently drops fields the deployed entity
      // does not declare — the upload succeeds, the row saves, and the image
      // simply never appears. Detect that and repair it instead of reporting
      // a success the user can see is false.
      const dropped = Object.keys(rest).filter(
        (k) =>
          typeof rest[k] === "string" &&
          /^https?:\/\//i.test(rest[k]) &&
          createdItem &&
          createdItem[k] !== rest[k]
      );
      if (dropped.length && createdItem?.id) {
        try {
          const patch = Object.fromEntries(dropped.map((k) => [k, rest[k]]));
          const repaired = await base44.entities[entity].update(createdItem.id, patch);
          if (repaired) createdItem = repaired;
        } catch {
          /* fall through to the warning below */
        }
        const stillDropped = dropped.filter(
          (k) => !createdItem || createdItem[k] !== rest[k]
        );
        if (stillDropped.length) {
          toast({
            title: "Enregistré, mais un champ image est manquant",
            description: `Le champ « ${stillDropped.join(", ")} » semble absent de l'entité ${entity} côté Base44. Ajoutez-le (type texte) dans Entities → ${entity}, puis Publish.`,
            variant: "destructive",
          });
          setOpen(false);
          await load();
          await loadPlaylists();
          return;
        }
      }

      let playlistAttached = true;
      if (playlist_id) {
        pendingPlaylistAttachmentRef.current = {
          item: createdItem,
          playlistId: playlist_id,
          data: rest,
        };
        try {
          await attachToPlaylist(createdItem, playlist_id, rest);
          pendingPlaylistAttachmentRef.current = null;
        } catch (err) {
          playlistAttached = false;
          setRetryingPlaylistAttachment(true);
          toast({
            title: "Contenu enregistré, ajout à la playlist impossible",
            description: err?.message || String(err),
            variant: "destructive",
          });
          await load();
          await loadPlaylists();
          return;
        }
      }

      if (!editing && playlistAttached) {
        notifyPlaylistUpload(createdItem, playlist_id);
      }

      if (playlistAttached) {
        toast({
          title: editing ? "Mis à jour" : playlist_id ? "Créé et ajouté à la playlist" : "Créé",
        });
      }
      setOpen(false);
      await load();
      await loadPlaylists();
    } catch (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePlaylistCreated = async (newPlaylist) => {
    setShowCreatePlaylist(false);
    await loadPlaylists();
    if (newPlaylist?.id && open) {
      pendingSelectRef.current = newPlaylist.id;
      selectedPlaylistRef.current = newPlaylist.id;
      setFormKey((k) => `${k}-pl-${newPlaylist.id}`);
    }
  };

  const removePlaylist = async (playlist) => {
    if (!(await confirmFr({ title: "Supprimer la playlist ?", message: `« ${playlist.name} » et les contenus qu'elle contient seront supprimés.`, confirmLabel: "Supprimer" }))) return;
    try {
      const pts = await base44.entities.PlaylistTrack.list(`-playlist_id eq "${playlist.id}"`, 500).catch(() => []);
      const arr = Array.isArray(pts) ? pts : [];
      for (const pt of arr) {
        await base44.entities[entity].delete(pt.track_id).catch(() => {});
        await base44.entities.PlaylistTrack.delete(pt.id).catch(() => {});
      }
      await base44.entities.Playlist.delete(playlist.id);
      toast({ title: "Playlist supprimée" });
      await load();
      await loadPlaylists();
    } catch (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const remove = async (item) => {
    if (!(await confirmFr({ title: "Supprimer cet élément ?", message: "Il sera aussi retiré de toutes les playlists.", confirmLabel: "Supprimer" }))) return;
    try {
      await detachFromPlaylists(item.id);
      await base44.entities[entity].delete(item.id);
      toast({ title: "Supprimé" });
      load();
      loadPlaylists();
    } catch (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  /* ─── Rendu ─────────────────────────────────────────────────────────── */
  return (
    <div>
      {/* ── Barre d'actions ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{items.length} élément(s)</p>
        {!readOnly && (
          <div className="flex gap-2 flex-wrap justify-end">
            {showPlaylist && (
              <button
                onClick={() => {
                  setEditingPlaylist(null);
                  setShowCreatePlaylist(true);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted transition"
              >
                <Plus className="h-4 w-4" /> Créer une nouvelle playlist
              </button>
            )}
            <button
              onClick={() => {
                setEditing(null);
                pendingSelectRef.current = null;
                selectedPlaylistRef.current = null;
                pendingPlaylistAttachmentRef.current = null;
                setRetryingPlaylistAttachment(false);
                setFormKey("new");
                setOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:scale-105 transition"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
        )}
      </div>

      {/* ── Section playlists ── */}
      {showPlaylist && isAdmin && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Playlists ({playlists.length})
            </p>
            {playlists.length > 1 && (
              <LockToggle locked={playlistsLocked} onToggle={() => setPlaylistsLocked((v) => !v)} />
            )}
          </div>

          {playlists.length === 0 ? (
            <p className="text-sm text-foreground/50">Aucune playlist. Utilisez « Créer une nouvelle playlist ».</p>
          ) : (
            <div ref={playlistDrag.listRef} className="space-y-2">
              {playlists.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-transform duration-150 select-none"
                >
                  {/* Poignée drag */}
                  {!playlistsLocked && (
                    <div
                      className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground"
                      onMouseDown={playlistDrag.onMouseDown(idx)}
                      onTouchStart={playlistDrag.onTouchStart(idx)}
                    >
                      <GripVertical className="h-5 w-5" />
                    </div>
                  )}

                  <PlaylistCover
                    playlist={p}
                    className="h-10 w-10 shrink-0 rounded-[10px] ring-1 ring-border"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.created_date || Date.now()).toLocaleDateString("fr-FR")}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setEditingPlaylist(p);
                      setShowCreatePlaylist(true);
                    }}
                    className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted shrink-0"
                    title="Modifier la playlist"
                    aria-label={`Modifier la playlist ${p.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removePlaylist(p)}
                    className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted text-destructive shrink-0"
                    title="Supprimer la playlist et ses contenus"
                    aria-label={`Supprimer la playlist ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Liste des éléments (musiques / prédications…) ── */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-foreground/50 py-8">{emptyLabel || "Aucun élément."}</p>
      ) : (
        <>
          {isAdmin && items.length > 1 && (
            <div className="flex justify-end mb-2">
              <LockToggle locked={tracksLocked} onToggle={() => setTracksLocked((v) => !v)} />
            </div>
          )}
          <div ref={itemDrag.listRef} className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-transform duration-150 select-none"
              >
                {/* Poignée drag musiques */}
                {!tracksLocked && isAdmin && (
                  <div
                    className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground pt-1"
                    onMouseDown={itemDrag.onMouseDown(idx)}
                    onTouchStart={itemDrag.onTouchStart(idx)}
                  >
                    <GripVertical className="h-5 w-5" />
                  </div>
                )}

                {thumbField && item[thumbField] && (
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[12px] bg-muted ring-1 ring-border">
                    <Image src={item[thumbField]} fittingType="fill" className="h-full w-full" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {listColumns.map((c) => item[c]).filter(Boolean).join(" · ") || "Sans titre"}
                  </div>
                  {detailField && item[detailField] && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item[detailField]}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(item.created_date || item.updated_date).toLocaleDateString("fr-FR")}
                  </div>
                </div>

                {!readOnly && (
                  <>
                    <button
                      onClick={() => {
                        setEditing(item);
                        pendingSelectRef.current = null;
                        selectedPlaylistRef.current = null;
                        pendingPlaylistAttachmentRef.current = null;
                        setRetryingPlaylistAttachment(false);
                        setFormKey(`edit-${item.id}`);
                        setOpen(true);
                      }}
                      className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted shrink-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(item)}
                      className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Dialog formulaire ── */}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            pendingPlaylistAttachmentRef.current = null;
            setRetryingPlaylistAttachment(false);
          }
          setOpen(nextOpen);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier" : "Ajouter"}</DialogTitle>
          </DialogHeader>
          <EntityForm
            key={formKey}
            fields={allFields}
            initial={{ ...(editing || {}), ...(pendingSelectRef.current ? { playlist_id: pendingSelectRef.current } : {}) }}
            onSubmit={submit}
            onPlaylistChange={(playlistId) => {
              selectedPlaylistRef.current = playlistId;
            }}
            retryingPlaylistAttachment={retryingPlaylistAttachment}
            onCancel={() => setOpen(false)}
            saving={saving}
          />
        </DialogContent>
      </Dialog>

      <CreatePlaylistModal
        open={showCreatePlaylist}
        onOpenChange={(v) => setShowCreatePlaylist(v)}
        onSaved={(savedPlaylist) => {
          if (editingPlaylist) {
            setEditingPlaylist(null);
            loadPlaylists();
          } else {
            handlePlaylistCreated(savedPlaylist);
          }
        }}
        category={PLAYLIST_CATEGORY[entity] || "other"}
        playlist={editingPlaylist}
      />
    </div>
  );
}