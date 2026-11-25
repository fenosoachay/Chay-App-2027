import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { backendText } from "@/api/backendConfig";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { notifyAdminUpload } from "@/lib/adminNotify";
import { annonceVisibleMaintenant, genreAnnonce } from "@/lib/cibleAccueil";
import { confirmFr } from "@/lib/confirmFr";
import { HEURE_RE } from "@/lib/upcomingEvents";
import { idYoutube } from "@/lib/youtubeEmbed";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Lock, Unlock, ChevronDown, ChevronRight, FolderPlus, Search, X, BellRing } from "lucide-react";
import { ENTITES_ATTENTION, estMindset, notifierAutomatiquement, texteAttention } from "@/lib/notificationAttention";
import { Image } from "@/components/ui/image";
import { AUDIENCES } from "@/lib/audience";
import EntityForm from "@/components/admin/EntityForm";
import CreatePlaylistModal from "@/components/media/CreatePlaylistModal";
import PlaylistCover from "@/components/media/PlaylistCover";
import ListeTriable from "@/components/media/ListeTriable";
import ArbrePlaylistsTriable from "@/components/media/ArbrePlaylistsTriable";
import {
  CATEGORIE_PLAYLIST,
  arbrePlaylists,
  exigeSousPlaylist,
  optionsPlaylistEtSousPlaylists,
  playlistDe,
} from "@/lib/playlistsArbre";
import {
  buildPlaylistTrackRecord,
  deletePlaylistWithContents,
  resolveSelectedPlaylistId,
  savePlaylistTrack,
} from "@/lib/playlistAttachment";

/** Champ PlaylistTrack qui porte le média (vérifié après l'ajout à la playlist), selon l'entité. */
const CHAMP_MEDIA = { MusicTrack: "audio_url", Sermon: "audio_url", Video: "video_url", VideoEnfant: "video_url" };

/** Liste admin : nombre maximum de contenus chargés (tout, en pratique). */
const LIMITE_LISTE = 1000;
const simplifier = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const dateDe = (item) => new Date(item.created_date || item.updated_date || 0).getTime();
const TRIS = [
  { id: "defaut", label: "Par défaut" },
  { id: "recents", label: "Plus récents" },
  { id: "anciens", label: "Plus anciens" },
  { id: "az", label: "A → Z" },
];

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
  // Valeurs fixes (ex. { page: "foi" }) : seuls ces contenus sont listés, et chaque création les reçoit.
  fixe = null,
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
  // Liste des contenus : recherche, tri, et playlist de chaque contenu (liens PlaylistTrack).
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState("defaut");
  const [liens, setLiens] = useState([]);
  const categorie = CATEGORIE_PLAYLIST[entity];
  // Musique, Prédication, YouTube, Articles, Galerie : tout contenu est rangé dans une sous-playlist.
  const sousPlaylist = showPlaylist && exigeSousPlaylist(entity);
  const arbre = useMemo(() => (sousPlaylist ? arbrePlaylists(playlists, categorie) : []), [sousPlaylist, playlists, categorie]);
  const racines = sousPlaylist ? arbre : playlists;

  const load = async () => {
    setLoading(true);
    const [res, tracks] = await Promise.all([
      (fixe
        ? base44.entities[entity].filter(fixe, sort || "-created_date", LIMITE_LISTE)
        : base44.entities[entity].list(sort || "-created_date", LIMITE_LISTE)
      ).catch(() => []),
      showPlaylist ? base44.entities.PlaylistTrack.list("-created_date", 20000).catch(() => []) : [],
    ]);
    setItems(Array.isArray(res) ? res : []);
    setLiens(Array.isArray(tracks) ? tracks : []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
  useEffect(() => { load(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
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
  }, [loadPlaylists, toast, sousPlaylist]);

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
    isRetry = false,
    precedent = null
  ) => {
    if (!playlistId) return;
    const record = buildPlaylistTrackRecord({
      entity,
      playlistId,
      item: createdItem,
      submittedData,
      coverField: playlistField,
    });
    // Modification : le compteur d'écoutes / vues est gardé, et la place aussi si la playlist n'a pas changé.
    if (precedent) {
      if (precedent.listen_count > 0) record.listen_count = precedent.listen_count;
      if (precedent.orders?.[playlistId] !== undefined) record.order = precedent.orders[playlistId];
    }
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
    const kindMap = { MusicTrack: "music", Sermon: "sermon", Video: "film", VideoEnfant: "film_enfant", Article: "article", YouTubeVideo: "youtube", GalleryImage: "gallery", Paroles: "paroles", Verset: "verset" };
    // Annonce / réunion : notification qui ouvre l'annonce, si elle est déjà visible (date passée ou du jour).
    if (entity === "Announcement") {
      if (item?.id && annonceVisibleMaintenant(item.date)) {
        notifyAdminUpload({ kind: genreAnnonce(item), title: item.title, contentId: item.id });
      }
      return;
    }
    const kind = kindMap[entity];
    if (!kind) return;
    // 1.3.34 : Mindset (Vidéo, Galerie) : pas de notification automatique ; l'admin l'envoie s'il le veut (🔔).
    const pl = playlists.find((p) => p.id === playlistId);
    const parent = pl?.parent_id ? playlists.find((p) => p.id === pl.parent_id) : null;
    if (!notifierAutomatiquement(entity, [parent?.name, pl?.name].filter(Boolean).join(" › "))) return;
    notifyAdminUpload({
      kind,
      title: item.title,
      artist: item.artist,
      playlist: playlists.find((p) => p.id === playlistId)?.name,
      playlistId,
      contentId: item.id,
      audience: item.audience,
    });
  };

  // « C'est pour » (Tout le monde / Membre / VIP) : changement rapide depuis la liste, sans ouvrir la fiche.
  // Les liens de playlist du contenu suivent (le serveur filtre aussi les titres des playlists).
  const avecAudience = fields.some((f) => f.name === "audience");
  const changerAudience = async (item, audience) => {
    if (!audience || item.audience === audience) return;
    setItems((l) => l.map((x) => (x.id === item.id ? { ...x, audience } : x)));
    try {
      await base44.entities[entity].update(item.id, { audience });
      const liens = await base44.entities.PlaylistTrack.filter({ track_id: item.id }, "-created_date", 50).catch(() => []);
      await Promise.all((liens || []).map((l) => base44.entities.PlaylistTrack.update(l.id, { audience })));
    } catch (e) {
      toast({ title: "Non enregistré", description: e?.message, variant: "destructive" });
      await load();
    }
  };

  const detachFromPlaylists = async (itemId) => {
    const tracks = await base44.entities.PlaylistTrack.filter(
      { track_id: itemId },
      "-created_date",
      5000
    );
    const liste = Array.isArray(tracks) ? tracks : [];
    await Promise.all(liste.map((track) => base44.entities.PlaylistTrack.delete(track.id)));
    // Ce qu'il faut garder en recréant le lien : compteur d'écoutes / vues, place dans chaque playlist.
    return {
      listen_count: liste.reduce((m, t) => Math.max(m, Number(t.listen_count) || 0), 0),
      orders: Object.fromEntries(liste.map((t) => [t.playlist_id, t.order])),
    };
  };

  const submit = async (data) => {
    setSaving(true);
    try {
      const { playlist_id: submittedPlaylistId, ...rest } = data;
      if (fixe) Object.assign(rest, fixe);
      // Site chay.fr : un nouveau contenu se place à la fin de la liste (ordre réglable au cadenas).
      if (!editing && (entity.startsWith("Site") || entity === "LienAccueil") && sort === "order" && rest.order === undefined) {
        rest.order = items.reduce((m, i) => Math.max(m, Number(i.order) || 0), -1) + 1;
      }
      // 1.3.34 : un champ « playlist_lecteur » (Texte qui défile : « Seulement dans cette playlist ») est un
      // simple réglage du contenu, enregistré tel quel ; ce n'est pas un rangement dans la playlist (avant : le
      // texte était enregistré sans sa playlist et l'app tentait un ajout à la playlist, refusé).
      const playlistReglage = fields.some((f) => f.name === "playlist_id" && f.type === "playlist_lecteur");
      if (playlistReglage) rest.playlist_id = submittedPlaylistId || "";
      const playlist_id = playlistReglage ? null : resolveSelectedPlaylistId(
        selectedPlaylistRef.current,
        submittedPlaylistId
      );

      // Réunion (annonce de type Événement) : heure obligatoire à la création (affichage + archivage).
      if (entity === "Announcement" && !editing && rest.type === "event" && !HEURE_RE.test(rest.event_time || "")) {
        toast({ title: "Heure requise", description: "Indiquez l'heure de la réunion (HH:MM).", variant: "destructive" });
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

      // YouTube : on n'enregistre que l'identifiant (11 caractères), quel que soit le lien collé (watch, youtu.be, live…).
      if (entity === "YouTubeVideo" && Object.prototype.hasOwnProperty.call(rest, "youtube_id")) {
        const idYt = idYoutube(rest.youtube_id);
        if (!idYt) {
          toast({ title: "Lien YouTube non reconnu", description: "Collez le lien de la vidéo (youtube.com/watch?v=…, youtu.be/…, youtube.com/live/…) ou son identifiant.", variant: "destructive" });
          return;
        }
        rest.youtube_id = idYt;
      }

      let createdItem;
      let precedent = null;
      if (editing) {
        createdItem = await base44.entities[entity].update(editing.id, rest);
        precedent = await detachFromPlaylists(editing.id);
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
          await attachToPlaylist(createdItem, playlist_id, rest, false, precedent);
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

  /** Modification : la playlist/sous-playlist actuelle du contenu est pré-remplie (lue dans PlaylistTrack). */
  const ouvrirModification = async (item) => {
    let actuelle = null;
    if (sousPlaylist) {
      const liens = await base44.entities.PlaylistTrack.filter({ track_id: item.id }, "-created_date", 50).catch(() => []);
      actuelle = playlistDe(item.id, Array.isArray(liens) ? liens : [], arbre) || null;
    }
    setEditing(item);
    pendingSelectRef.current = actuelle;
    selectedPlaylistRef.current = actuelle;
    pendingPlaylistAttachmentRef.current = null;
    setRetryingPlaylistAttachment(false);
    setFormKey(`edit-${item.id}-${actuelle || ""}`);
    setOpen(true);
  };

  /** 1.3.34 : notification manuelle d'un contenu Mindset : « Chay attire ton attention sur… ». */
  const [attentionEnvoi, setAttentionEnvoi] = useState(null);
  const envoyerAttention = async (item) => {
    const texte = texteAttention(entity, item.title);
    if (!(await confirmFr({ title: "Envoyer la notification ?", message: texte, confirmLabel: "Envoyer" }))) return;
    setAttentionEnvoi(item.id);
    const ok = await notifyAdminUpload({
      kind: ENTITES_ATTENTION[entity] === "photo" ? "gallery" : "film",
      title: item.title,
      contentId: item.id,
      audience: item.audience,
      attention: texte,
    });
    setAttentionEnvoi(null);
    toast(ok ? { title: "Notification envoyée" } : { title: "Notification non envoyée", description: "Vérifiez la connexion et réessayez.", variant: "destructive" });
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

  /* ─── Liste affichée : recherche + tri (désactivés pendant la réorganisation au cadenas) ─── */
  const reorganisation = isAdmin && !tracksLocked;
  const titreDe = (item) => listColumns.map((c) => item[c]).filter(Boolean).join(" · ");
  const itemsAffiches = useMemo(() => {
    if (reorganisation) return items;
    const mots = simplifier(recherche).split(/\s+/).filter(Boolean);
    let liste = mots.length
      ? items.filter((item) => {
          const texte = simplifier(`${titreDe(item)} ${detailField ? item[detailField] || "" : ""}`);
          return mots.every((m) => texte.includes(m));
        })
      : [...items];
    if (tri === "recents") liste.sort((a, b) => dateDe(b) - dateDe(a));
    else if (tri === "anciens") liste.sort((a, b) => dateDe(a) - dateDe(b));
    else if (tri === "az") liste.sort((a, b) => titreDe(a).localeCompare(titreDe(b), "fr", { sensitivity: "base" }));
    return liste;
  }, [items, recherche, tri, reorganisation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playlist de chaque contenu : « Playlist › Sous-playlist », ou rien (=> « Non rangé »).
  const playlistParContenu = useMemo(() => {
    if (!showPlaylist) return new Map();
    const parId = new Map(playlists.map((p) => [p.id, p]));
    const m = new Map();
    for (const l of liens) {
      const p = parId.get(l.playlist_id);
      if (!p || m.has(l.track_id)) continue;
      const parent = p.parent_id ? parId.get(p.parent_id) : null;
      m.set(l.track_id, parent ? `${parent.name} › ${p.name}` : p.name);
    }
    return m;
  }, [showPlaylist, playlists, liens]);

  /* ─── Rendu ─────────────────────────────────────────────────────────── */
  return (
    <div>
      {/* ── Barre d'actions ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {itemsAffiches.length === items.length ? `${items.length} élément(s)` : `${itemsAffiches.length} sur ${items.length} élément(s)`}
        </p>
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
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {!reorganisation && (
              <>
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                  <input
                    type="search"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Rechercher un titre…"
                    aria-label="Rechercher dans la liste"
                    className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
                  />
                  {recherche && (
                    <button
                      type="button"
                      onClick={() => setRecherche("")}
                      aria-label="Effacer la recherche"
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-foreground/50 hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <select
                  value={tri}
                  onChange={(e) => setTri(e.target.value)}
                  aria-label="Trier la liste"
                  className="rounded-full border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                >
                  {TRIS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </>
            )}
            {reorganisation && (
              <p className="flex-1 text-xs text-foreground/50">Réorganisation : glissez les éléments. Recherche et tri reviennent en refermant le cadenas.</p>
            )}
            {isAdmin && items.length > 1 && (
              <LockToggle locked={tracksLocked} onToggle={() => setTracksLocked((v) => !v)} />
            )}
          </div>
          {itemsAffiches.length === 0 && (
            <p className="text-sm text-foreground/50 py-6">Aucun élément ne correspond à « {recherche} ».</p>
          )}
          <ListeTriable
            id={`elements-${entity}`}
            items={itemsAffiches}
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
                  {showPlaylist && (
                    playlistParContenu.has(item.id) ? (
                      <div className="text-xs font-semibold text-primary mt-1 truncate">{playlistParContenu.get(item.id)}</div>
                    ) : (
                      <div className="text-xs font-semibold text-amber-500 mt-1">Non rangé</div>
                    )
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(item.created_date || item.updated_date).toLocaleDateString("fr-FR")}
                  </div>
                </div>

                {avecAudience && !readOnly && (
                  <select
                    value={item.audience || ""}
                    onChange={(e) => changerAudience(item, e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="C'est pour"
                    className={`shrink-0 rounded-full border px-2 py-1 text-xs font-bold outline-none ${
                      item.audience === "vip" ? "border-[#C9A227] text-[#8a6d00] dark:text-[#F2C94C]"
                        : item.audience === "membre" ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                          : item.audience === "tous" ? "border-border"
                            : "border-amber-500 text-amber-600"
                    } bg-background`}
                  >
                    <option value="" disabled>À classer</option>
                    {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                )}

                {!readOnly && (
                  <>
                    {ENTITES_ATTENTION[entity] && estMindset(playlistParContenu.get(item.id)) && (
                      <button
                        type="button"
                        onClick={() => envoyerAttention(item)}
                        disabled={attentionEnvoi === item.id}
                        className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted text-primary shrink-0 disabled:opacity-50"
                        title="Envoyer une notification"
                        aria-label={`Envoyer une notification pour ${item.title || "ce contenu"}`}
                      >
                        {attentionEnvoi === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                      </button>
                    )}
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
