import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import useMemberDirectory from "@/hooks/useMemberDirectory";
import { X, ChevronLeft, ChevronRight, PenLine, Send, Loader2, Pencil, Trash2, Check } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { parseWixMediaUrl, buildTransformUrl } from "@/components/ui/image-helpers";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { GALLERY_SECTIONS } from "@/lib/mediaConstants";
import { confirmFr } from "@/lib/confirmFr";

// Les commentaires de photo réutilisent l'entité Comment (déjà utilisée par
// la Communauté). Le champ `post_id` reçoit un préfixe « gallery: » pour ne
// jamais entrer en collision avec l'identifiant d'un vrai post.
const commentKey = (id) => `gallery:${id}`;

export default function GalleryViewer({ items = [], index, onClose, onItemUpdated, onItemDeleted }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [i, setI] = useState(index || 0);
  // Synchronisation de l'index pendant le rendu (et non dans un useEffect) :
  // l'état `i` est corrigé AVANT le premier rendu, donc toucher la photo n°3
  // n'affiche jamais la photo n°0 pendant une frame. Avec `key={i}` sur l'image,
  // un rendu « faux » forçait un remontage + un rechargement du fichier —
  // c'était le petit clignotement à la touche. À la fermeture (index = null)
  // on ne réinitialise PAS `i` : la photo affichée reste stable pendant
  // l'animation de sortie au lieu de basculer sur la première.
  const [prevIndex, setPrevIndex] = useState(index);
  if (index !== prevIndex) {
    setPrevIndex(index);
    if (index !== null && index !== undefined) setI(index);
  }
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editVisibility, setEditVisibility] = useState("membre");
  const [replacementFile, setReplacementFile] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [busyCommentId, setBusyCommentId] = useState(null);

  // ── Anti-clignotement ──────────────────────────────────────────────────
  // 1. On ne montre l'image qu'une fois entièrement téléchargée : un gros
  //    JPEG se peint par à-coups (progressif) et la photo « clignote »
  //    plusieurs secondes au moment du toucher.
  // 2. On demande une version à la taille de l'écran plutôt que l'original
  //    (souvent plusieurs Mo) : le chargement devient instantané.
  const imgRef = useRef(null);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [failedTransform, setFailedTransform] = useState(null);
  const [viewWidth] = useState(() =>
    Math.min(
      2400,
      Math.max(1200, Math.round((window.innerWidth || 1200) * Math.min(window.devicePixelRatio || 1, 2)))
    )
  );

  const touch = useRef(null);
  const swiped = useRef(false);
  const swipeTimer = useRef(null);

  const isOpen = index !== null && index !== undefined && items.length > 0;
  const current = isOpen ? items[i] : null;
  const key = current && current.id ? commentKey(current.id) : null;
  const canManageItem = Boolean(
    current && (current.created_by_id === user?.id || user?.role === "admin")
  );

  const sourceUrl = (current && current.image_url) || null;
  const parsedUrl = sourceUrl ? parseWixMediaUrl(sourceUrl) : null;
  const transformSrc = parsedUrl
    ? buildTransformUrl(parsedUrl, {
        width: viewWidth,
        height: undefined,
        crop: undefined,
        focalPoint: undefined,
        quality: 85,
      })
    : null;
  const displaySrc =
    transformSrc && failedTransform !== transformSrc ? transformSrc : sourceUrl;
  const isLoaded = Boolean(displaySrc && loadedSrc === displaySrc);

  // Une photo déjà en cache peut avoir fini de charger avant que React
  // n'ait pu capter onLoad : on vérifie l'état réel de l'élément.
  useEffect(() => {
    const el = imgRef.current;
    if (displaySrc && el && el.complete && el.naturalWidth > 0) setLoadedSrc(displaySrc);
  }, [displaySrc, i]);

  // Retour matériel : on ferme d'abord les commentaires, puis la photo.
  // (Le viewer n'est plus « toujours ouvert » : sinon il empilait une entrée
  // d'historique fantôme à chaque ouverture de la catégorie Galerie.)
  useBackHandler(isOpen, onClose);
  useBackHandler(showComments && isOpen, () => setShowComments(false));

  // Chargement des commentaires de la photo affichée.
  useEffect(() => {
    if (!key) {
      setComments([]);
      return;
    }
    let alive = true;
    setLoadingComments(true);
    base44.entities.Comment
      .filter({ post_id: key }, "-created_date", 50)
      .then((res) => { if (alive) setComments(Array.isArray(res) ? res : []); })
      .catch(() => { if (alive) setComments([]); })
      .finally(() => { if (alive) setLoadingComments(false); });
    return () => { alive = false; };
  }, [key]);

  useEffect(() => () => window.clearTimeout(swipeTimer.current), []);

  // Nom d'un commentateur → son profil (la visionneuse se ferme d'abord).
  const navigate = useNavigate();
  const { nameOf } = useMemberDirectory();
  const openProfile = (userId) => {
    onClose?.();
    setTimeout(() => navigate(`/profile/${userId}`), 0);
  };

  const go = (delta) =>
    setI((v) => (v + delta + items.length) % items.length);

  const prev = (e) => { e?.stopPropagation(); go(-1); };
  const next = (e) => { e?.stopPropagation(); go(1); };

  // Clavier de l'ordinateur : ← → changent de photo, Échap ferme les
  // commentaires puis la visionneuse (sans interférer avec la frappe).
  useKeyboardShortcuts(isOpen && !editingItem, {
    ArrowLeft: () => { if (items.length > 1) go(-1); },
    ArrowRight: () => { if (items.length > 1) go(1); },
    Escape: () => (showComments ? setShowComments(false) : onClose?.()),
  });

  // ── Glissement horizontal au doigt ──────────────────────────────────────
  const onTouchStart = (e) => {
    // Un glissement commencé dans le panneau de commentaires ne doit pas
    // faire changer de photo (surtout pendant la frappe).
    if (e.target?.closest?.("[data-comments-panel]")) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start || items.length < 2) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;

    // On empêche le « clic » de fond (qui fermerait la visionneuse)
    // de se déclencher juste après le glissement.
    swiped.current = true;
    window.clearTimeout(swipeTimer.current);
    swipeTimer.current = window.setTimeout(() => { swiped.current = false; }, 400);

    if (dx < 0) go(1);
    else go(-1);
  };

  const onBackdropClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    onClose?.();
  };

  // ── Commentaires ────────────────────────────────────────────────────────
  const authorName =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Membre";

  const send = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !key || sending) return;

    setSending(true);
    try {
      const created = await base44.entities.Comment.create({
        post_id: key,
        text,
        author_name: authorName,
      });
      setComments((prev) => [
        created || {
          id: `tmp-${Date.now()}`,
          post_id: key,
          text,
          author_name: authorName,
          created_date: new Date().toISOString(),
        },
        ...prev,
      ]);
      setDraft("");
    } catch {
      // Le brouillon reste en place : l'utilisateur peut réessayer.
    } finally {
      setSending(false);
    }
  };

  const beginEditItem = () => {
    setEditTitle(current?.title || "");
    setEditCategory(current?.category || "");
    setEditVisibility(current?.visibility || "membre");
    setReplacementFile(null);
    setEditingItem(true);
  };

  const saveItem = async (event) => {
    event.preventDefault();
    if (!current || savingItem) return;
    setSavingItem(true);
    try {
      const image_url = replacementFile ? await uploadToBase44(replacementFile) : current.image_url;
      const patch = {
        title: editTitle.trim(),
        category: editCategory.trim() || null,
        visibility: editVisibility,
        image_url,
      };
      const updated = await base44.entities.GalleryImage.update(current.id, patch);
      onItemUpdated?.({ ...current, ...updated, ...patch });
      setEditingItem(false);
      toast({ title: "Photo mise à jour" });
      if (patch.category !== current.category) onClose?.();
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async () => {
    if (!current || deletingItem) return;
    if (!(await confirmFr({ title: "Supprimer la photo ?", message: "Cette action est irréversible.", confirmLabel: "Supprimer" }))) return;
    setDeletingItem(true);
    try {
      await base44.entities.GalleryImage.delete(current.id);
      onItemDeleted?.(current.id);
      onClose?.();
      toast({ title: "Photo supprimée" });
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setDeletingItem(false);
    }
  };

  const saveComment = async (comment) => {
    const text = editCommentText.trim();
    if (!text || busyCommentId) return;
    setBusyCommentId(comment.id);
    try {
      const updated = await base44.entities.Comment.update(comment.id, { text });
      setComments((prev) => prev.map((item) => item.id === comment.id ? { ...item, ...updated, text } : item));
      setEditingCommentId(null);
      toast({ title: "Commentaire modifié" });
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setBusyCommentId(null);
    }
  };

  const deleteComment = async (comment) => {
    if (busyCommentId || !(await confirmFr({ title: "Supprimer le commentaire ?", message: "Cette action est irréversible.", confirmLabel: "Supprimer" }))) return;
    setBusyCommentId(comment.id);
    try {
      await base44.entities.Comment.delete(comment.id);
      setComments((prev) => prev.filter((item) => item.id !== comment.id));
      toast({ title: "Commentaire supprimé" });
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setBusyCommentId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black grid place-items-center"
          onClick={onBackdropClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Contrôles haut : commentaires + fermeture */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            {canManageItem && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); beginEditItem(); }}
                  className="h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Modifier la photo"
                >
                  <Pencil className="h-5 w-5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteItem(); }}
                  disabled={deletingItem}
                  className="h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-red-500/70 disabled:opacity-50"
                  aria-label="Supprimer la photo"
                >
                  {deletingItem ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                </button>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose?.(); }}
              className="h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Flèches + compteur */}
          {items.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 z-10"
                aria-label="Photo précédente"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={next}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 z-10"
                aria-label="Photo suivante"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              {!showComments && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white z-10">
                  {i + 1} / {items.length}
                </div>
              )}
            </>
          )}

          {/* Commentaires : bandeau sous la photo */}
          {!showComments && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowComments(true); }}
              className="absolute bottom-4 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
              aria-label="Voir les commentaires"
            >
              <PenLine className="h-4 w-4" />
              {comments.length > 0
                ? `${comments.length} commentaire${comments.length > 1 ? "s" : ""}`
                : "Soyez le premier à commenter"}
            </button>
          )}

          {/* Indicateur tant que la photo n'est pas entièrement chargée */}
          {!isLoaded && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none z-10">
              <Loader2 className="h-8 w-8 animate-spin text-white/50" />
            </div>
          )}

          <motion.img
            ref={imgRef}
            key={i}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={isLoaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            src={displaySrc || undefined}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onLoad={() => { if (displaySrc) setLoadedSrc(displaySrc); }}
            onError={() => {
              // 1re erreur = transform refusée → on retente l'original ;
              // 2e erreur = fichier réellement cassé → on affiche quand même
              // (image en erreur du navigateur) plutôt qu'une rotation infinie.
              if (transformSrc && failedTransform !== transformSrc) {
                setFailedTransform(transformSrc);
              } else if (sourceUrl) {
                setLoadedSrc(sourceUrl);
              }
            }}
            className={`max-w-[92vw] object-contain select-none transition-[max-height] duration-200 ${
              showComments ? "max-h-[52vh]" : "max-h-[88vh]"
            }`}
          />

          {/* Panneau de commentaires */}
          {showComments && (
            <div
              data-comments-panel
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 z-30 flex max-h-[58vh] flex-col border-t border-white/15 bg-black/92 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-sm font-bold text-white">
                  Commentaires
                  {comments.length > 0 && (
                    <span className="ml-1.5 font-medium text-white/50">
                      ({comments.length})
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setShowComments(false)}
                  className="h-8 w-8 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Masquer les commentaires"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-[72px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {loadingComments ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                  </div>
                ) : comments.length ? (
                  comments.map((c) => (
                    <div key={c.id} className="text-sm leading-relaxed text-white/90">
                      {c.created_by_id ? (
                        <button
                          type="button"
                          onClick={() => openProfile(c.created_by_id)}
                          className="mr-2 font-bold text-white hover:underline"
                        >
                          {nameOf(c.created_by_id, c.author_name)}
                        </button>
                      ) : (
                        <span className="mr-2 font-bold text-white">
                          {c.author_name || "Membre"}
                        </span>
                      )}
                      {editingCommentId !== c.id && (
                        <span className="whitespace-pre-wrap break-words">{c.text}</span>
                      )}
                      {formatTimestamp(c.created_date, { time: false }) && (
                        <div className="mt-0.5 text-[11px] text-white/40">
                          {formatTimestamp(c.created_date, { time: false })}
                        </div>
                      )}
                      {(c.created_by_id === user?.id || user?.role === "admin") && (
                        <div className="mt-1 flex gap-3">
                          <button
                            type="button"
                            onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.text || ""); }}
                            className="text-[11px] text-white/50 hover:text-white"
                          >Modifier</button>
                          <button
                            type="button"
                            disabled={busyCommentId === c.id}
                            onClick={() => deleteComment(c)}
                            className="text-[11px] text-white/50 hover:text-red-300 disabled:opacity-50"
                          >Supprimer</button>
                        </div>
                      )}
                      {editingCommentId === c.id && (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={editCommentText}
                            onChange={(event) => setEditCommentText(event.target.value)}
                            className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1 text-sm text-white"
                          />
                          <button onClick={() => saveComment(c)} disabled={busyCommentId === c.id} aria-label="Enregistrer le commentaire" className="text-white">
                            {busyCommentId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button onClick={() => setEditingCommentId(null)} aria-label="Annuler" className="text-white/60">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/50">
                    Soyez le premier à commenter
                  </p>
                )}
              </div>

              <form
                onSubmit={send}
                className="flex items-center gap-2 border-t border-white/10 px-4 py-3"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Écrire un commentaire…"
                  className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:bg-white/15"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white transition disabled:opacity-40"
                  aria-label="Envoyer le commentaire"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </form>
            </div>
          )}
        </motion.div>
      )}
      <Dialog open={editingItem} onOpenChange={setEditingItem}>
        <DialogContent className="z-[70]">
          <DialogHeader>
            <DialogTitle>Modifier la photo</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveItem} className="space-y-4">
            <label className="block text-sm font-medium">
              Titre
              <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
            </label>
            <label className="block text-sm font-medium">
              Section
              <select value={editCategory} onChange={(event) => setEditCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2">
                <option value="">Non classée</option>
                {editCategory && !GALLERY_SECTIONS.some((section) => section.id === editCategory) && (
                  <option value={editCategory}>{editCategory}</option>
                )}
                {GALLERY_SECTIONS.map((section) => (
                  <option key={section.id} value={section.id}>{section.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Visibilité
              <select value={editVisibility} onChange={(event) => setEditVisibility(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2">
                <option value="membre">Membre</option>
                <option value="non-membre">Non-membre</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Remplacer l’image (facultatif)
              <input type="file" accept="image/*" onChange={(event) => setReplacementFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
            </label>
            <button type="submit" disabled={savingItem} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </AnimatePresence>
  );
}