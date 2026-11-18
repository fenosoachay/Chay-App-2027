import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { backendText } from "@/api/backendConfig";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { notifyAdminUpload } from "@/lib/adminNotify";
import { annonceVisibleMaintenant, genreAnnonce } from "@/lib/cibleAccueil";
import { confirmFr } from "@/lib/confirmFr";
import { HEURE_RE } from "@/lib/upcomingEvents";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Lock, Unlock, ChevronDown, ChevronRight, FolderPlus } from "lucide-react";
import { Image } from "@/components/ui/image";
import EntityForm from "@/components/admin/EntityForm";
import CreatePlaylistModal from "@/components/media/CreatePlaylistModal";
import PlaylistCover from "@/components/media/PlaylistCover";
import ListeTriable from "@/components/media/ListeTriable";
import ArbrePlaylistsTriable from "@/components/media/ArbrePlaylistsTriable";
import {
  schemaSansSousPlaylists,
  MESSAGE_SOUS_PLAYLIST,
  MESSAGE_SCHEMA_PLAYLISTS
} from "@/lib/playlist";
import {
  CATEGORIE_PLAYLIST,
  arbrePlaylists,
  exigeSousPlaylist,
  idsSousPlaylists,
  optionsPlaylistEtSousPlaylists,
  sousPlaylistDe,
} from "@/lib/playlistsArbre";
import {
  buildPlaylistTrackRecord,
  deletePlaylistWithContents,
  resolveSelectedPlaylistId,
  savePlaylistTrack,
} from "@/lib/playlistAttachment";

/** Champ PlaylistTrack qui porte le média (vérifié après l'ajout à la playlist), selon l'entité. */
const CHAMP_MEDIA = { MusicTrack: "audio_url", Sermon: "audio_url", Video: "video_url" };

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
  // Sous-playlists : playlist parente de la sous-playlist en cours de création, playlists dépliées.
  const [parentPourCreation, setParentPourCreation] = useState(null);
  const [deplies, setDeplies] = useState(() => new Set());
  const categorie = CATEGORIE_PLAYLIST[entity];
  // Musique, Prédication, YouTube, Articles, Galerie : tout contenu est rangé dans une sous-playlist.
  const sousPlaylist = showPlaylist && exigeSousPlaylist(entity);
  const arbre = useMemo(() => (sousPlaylist ? arbrePlaylists(playlists, categorie) : []), [sousPlaylist, playlists, categorie]);
  const racines = sousPlaylist ? arbre : playlists;

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
      const list = await base44.entities.Playlist.list("-created_date", 1000);
      const arr = Array.isArray(list) ? list : [];
      arr.sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) ||
          new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()
      );
      const cat = CATEGORIE_PLAYLIST[entity];
      // Sections à sous-playlists : toutes les playlists de la section (l'arbre est calculé à part) ;
      // Films : playlists de premier niveau seulement, comme avant.
      setPlaylists(
        cat
          ? arr.filter((p) => (p.category || "music") === cat && (exigeSousPlaylist(entity) || !p.parent_id))
          : arr
      );
    } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (showPlaylist) loadPlaylists(); }, [showPlaylist]);

  const allFields = sousPlaylist
    ? [
        {
          name: "playlist_id",
          label: "Playlist ou sous-playlist",
          type: "select",
          options: optionsPlaylistEtSousPlaylists(arbre),
          help: "Choisissez une playlist de 1er niveau OU une sous-playlist. La playlist est obligatoire ; la sous-playlist est facultative (le contenu s'affichera alors directement sous la playlist)."
        },
        ...fields,
      ]
    : showPlaylist
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
    // Avec sous-playlists : seul l'ordre des playlists de premier niveau change ici.
    const ordre = new Map(next.map((p, i) => [p.id, i]));
    setPlaylists((list) => (sousPlaylist
      ? list.map((p) => (ordre.has(p.id) ? { ...p, order: ordre.get(p.id) } : p))
      : next));
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
          backendText(
            "Le champ « order » semble absent de l'entité Playlist côté Base44. Ajoutez-le (type nombre) dans Entities → Playlist, puis Publish.",
            "Le champ « order » semble absent de la collection Playlist. Ajoutez-le (type nombre) dans le tableau de bord PocketBase (Collections → Playlist).",
          ),
        variant: "destructive",
      });
    }
  }, [loadPlaylists, toast, sousPlaylist]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Sauvegarde ordre musiques ── */
  const handleReorderItems = useCallback(async (next) => {
    setItems(next);
    await Promise.all(
      next.map((item, i) =>
        base44.entities[entity].update(item.id, { order: i }).catch(() => {})
      )
    );
  }, [entity]);

  /* ── Sauvegarde ordre des sous-playlists d'une playlist ── */
  const handleReorderSous = useCallback(async (next) => {
    const ordre = new Map(next.map((p, i) => [p.id, i]));
    setPlaylists((list) => list.map((p) => (ordre.has(p.id) ? { ...p, order: ordre.get(p.id) } : p)));
    const results = await Promise.all(
      next.map((p, i) => base44.entities.Playlist.update(p.id, { order: i }).then(() => true, () => false))
    );
    if (results.includes(false)) {
      await loadPlaylists();
      toast({ title: "Réorganisation non enregistrée", variant: "destructive" });
    }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const basculer = (id) => setDeplies((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

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
      CHAMP_MEDIA[entity] || null,
      { checkExisting: isRetry }
    );
  };

  const notifyPlaylistUpload = (item, playlistId) => {
    const kindMap = { MusicTrack: "music", Sermon: "sermon", Video: "film", Article: "article", YouTubeVideo: "youtube", GalleryImage: "gallery" };
    // Annonce / réunion : notification qui ouvre l'annonce, si elle est déjà visible (date passée ou du jour).
    if (entity === "Announcement") {
      if (item?.id && annonceVisibleMaintenant(item.date)) {
        notifyAdminUpload({ kind: genreAnnonce(item), title: item.title, contentId: item.id });
      }
      return;
    }
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

      // Réunion (annonce de type Événement) : heure obligatoire à la création (affichage + archivage).
      if (entity === "Announcement" && !editing && rest.type === "event" && !HEURE_RE.test(rest.event_time || "")) {
        toast({ title: "Heure requise", description: "Indiquez l'heure de la réunion (HH:MM).", variant: "destructive" });
        return;
      }
      if (sousPlaylist && !idsSousPlaylists(arbre).has(playlist_id)) {
        toast({ title: "Sous-playlist obligatoire", description: MESSAGE_SOUS_PLAYLIST, variant: "destructive" });
        return;
      }
      if (showPlaylist && !sousPlaylist && !editing && !playlist_id) {
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
            description: backendText(
              `Le champ « ${stillDropped.join(", ")} » semble absent de l'entité ${entity} côté Base44. Ajoutez-le (type texte) dans Entities → ${entity}, puis Publish.`,
              `Le champ « ${stillDropped.join(", ")} » semble absent de la collection ${entity}. Ajoutez-le (type texte) dans le tableau de bord PocketBase (Collections → ${entity}).`,
            ),
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
    if (sousPlaylist && !playlist.parent_id && playlists.some((p) => p.parent_id === playlist.id)) {
      toast({
        title: "Playlist non vide",
        description: "Supprimez d'abord ses sous-playlists.",
        variant: "destructive",
      });
      return;
    }
    if (!(await confirmFr({ title: "Supprimer la playlist ?", message: `« ${playlist.name} » et les contenus qu'elle contient seront supprimés.`, confirmLabel: "Supprimer" }))) return;
    try {
      await deletePlaylistWithContents(base44, entity, playlist.id);
      toast({ title: "Playlist supprimée" });
      await load();
      await loadPlaylists();
    } catch (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  /** Modification : la sous-playlist actuelle du contenu est pré-remplie (lue dans PlaylistTrack). */
  const ouvrirModification = async (item) => {
    let actuelle = null;
    if (sousPlaylist) {
      const liens = await base44.entities.PlaylistTrack.filter({ track_id: item.id }, "-created_date", 50).catch(() => []);
      actuelle = sousPlaylistDe(item.id, Array.isArray(liens) ? liens : [], arbre) || null;
    }
    setEditing(item);
    pendingSelectRef.current = actuelle;
    selectedPlaylistRef.current = actuelle;
    pendingPlaylistAttachmentRef.current = null;
    setRetryingPlaylistAttachment(false);
    setFormKey(`edit-${item.id}-${actuelle || ""}`);
    setOpen(true);
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

  /** Modifier / supprimer une playlist ou une sous-playlist. */
  const BoutonsPlaylist = ({ p }) => (
    <>
      <button
        type="button"
        onClick={() => {
          setEditingPlaylist(p);
          setParentPourCreation(null);
          setShowCreatePlaylist(true);
        }}
        className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted shrink-0"
        title={p.parent_id ? "Modifier la sous-playlist" : "Modifier la playlist"}
        aria-label={`${p.parent_id ? "Modifier la sous-playlist" : "Modifier la playlist"} ${p.name}`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => removePlaylist(p)}
        className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted text-destructive shrink-0"
        title="Supprimer (et ses contenus)"
        aria-label={`Supprimer ${p.parent_id ? "la sous-playlist" : "la playlist"} ${p.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

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
                  setParentPourCreation(null);
                  setShowCreatePlaylist(true);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted transition"
              >
                <Plus className="h-4 w-4" /> {sousPlaylist ? "Nouvelle playlist" : "Créer une nouvelle playlist"}
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

      {/* ── Section playlists (avec sous-playlists : Playlist > Sous-playlist) ── */}
      {showPlaylist && isAdmin && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Playlists ({racines.length})
            </p>
            {(racines.length > 1 || racines.some((p) => (p.sous || []).length > 1)) && (
              <LockToggle locked={playlistsLocked} onToggle={() => setPlaylistsLocked((v) => !v)} />
            )}
          </div>

          {/* Serveur sans champ Playlist.parent_id : les sous-playlists ne peuvent pas être enregistrées (1.3.9). */}
          {sousPlaylist && schemaSansSousPlaylists(playlists) && (
            <p role="alert" className="mb-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {MESSAGE_SCHEMA_PLAYLISTS}
            </p>
          )}

          {racines.length === 0 ? (
            <p className="text-sm text-foreground/50">
              Aucune playlist. Utilisez « {sousPlaylist ? "Nouvelle playlist" : "Créer une nouvelle playlist"} »
              {sousPlaylist ? ", puis ajoutez-y une sous-playlist." : "."}
            </p>
          ) : sousPlaylist ? (
            <ArbrePlaylistsTriable
              arbre={arbre}
              actif={!playlistsLocked}
              deplies={deplies}
              onReorderRacines={handleReorderPlaylists}
              onReorderSous={handleReorderSous}
              renderVide={() => (
                <p className="text-xs text-foreground/50 py-1">Aucune sous-playlist : utilisez le bouton « Nouvelle sous-playlist ».</p>
              )}
              renderPlaylist={(p) => (
                <>
                  <button
                    type="button"
                    onClick={() => basculer(p.id)}
                    className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted shrink-0"
                    aria-label={deplies.has(p.id) ? `Replier ${p.name}` : `Déplier ${p.name}`}
                    aria-expanded={deplies.has(p.id)}
                  >
                    {deplies.has(p.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <PlaylistCover playlist={p} className="h-10 w-10 shrink-0 rounded-[10px] ring-1 ring-border" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.sous.length} sous-playlist{p.sous.length > 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlaylist(null);
                      setParentPourCreation(p);
                      setShowCreatePlaylist(true);
                      setDeplies((prev) => new Set(prev).add(p.id));
                    }}
                    className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted shrink-0"
                    title="Nouvelle sous-playlist"
                    aria-label={`Nouvelle sous-playlist dans ${p.name}`}
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                  <BoutonsPlaylist p={p} />
                </>
              )}
              renderSous={(sp) => (
                <>
                  <PlaylistCover playlist={sp} className="h-8 w-8 shrink-0 rounded-[8px] ring-1 ring-border" />
                  <div className="flex-1 min-w-0 font-semibold text-sm truncate">{sp.name}</div>
                  <BoutonsPlaylist p={sp} />
                </>
              )}
            />
          ) : (
            <ListeTriable
              id={`playlists-${entity}`}
              items={racines}
              actif={!playlistsLocked}
              onReorder={handleReorderPlaylists}
              renderRow={(p) => (
                <>
                  <PlaylistCover playlist={p} className="h-10 w-10 shrink-0 rounded-[10px] ring-1 ring-border" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.created_date || Date.now()).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <BoutonsPlaylist p={p} />
                </>
              )}
            />
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
          <ListeTriable
            id={`elements-${entity}`}
            items={items}
            actif={!tracksLocked && isAdmin}
            onReorder={handleReorderItems}
            renderRow={(item) => (
              <>
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
                      type="button"
                      onClick={() => ouvrirModification(item)}
                      className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted shrink-0"
                      aria-label="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted text-destructive shrink-0"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </>
            )}
          />
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
        category={CATEGORIE_PLAYLIST[entity] || "other"}
        playlist={editingPlaylist}
        parent={parentPourCreation}
      />
    </div>
  );
}