import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { useToast } from "@/components/ui/use-toast";
import { BookOpen, ArrowRight, Share2, Pencil, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  toISODate,
  formatISODate,
  isISODate,
  addDaysISO,
} from "@/lib/localDate";
import PeriodPlanner from "@/components/home/PeriodPlanner";
import useStagedPublish from "@/hooks/useStagedPublish";
import { confirmFr } from "@/lib/confirmFr";

// Nombre d'entrées lues pour alimenter le planning (une par jour au maximum).
const PLANNING_LIMIT = 2000;

// Verset du jour : affiche le dévotional du jour (carte dégradée) et permet
// à un administrateur de le programmer à l'avance (date d'affichage + planning
// des 30 jours, avec navigation par période pour consulter l'historique).
// L'affichage est automatique : le jour J, c'est l'entrée datée de J qui
// apparaît, sans intervention.
export default function VersetDuJourSection({ refreshKey = 0, adminOnly = false }) {
  const { user, isLocalMode } = useAuth();
  const { toast } = useToast();
  const isAdmin = !isLocalMode && user?.role === "admin";
  const [devotional, setDevotional] = useState(null); // verset affiché
  const [todayDev, setTodayDev] = useState(null); // verset daté d'aujourd'hui
  const [all, setAll] = useState([]); // entrées récentes, pour le planning
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [draft, setDraft] = useState({
    id: undefined, // id de l'entrée serveur que le formulaire modifie
    scripture_reference: "",
    verse_text: "",
    reading_date: toISODate(),
  });

  // File « à publier » : on enregistre plusieurs versets dans la fenêtre,
  // rien ne part au serveur, puis un seul « Publier » les écrit tous.
  const { pending, publishing, stage, discard, publish } = useStagedPublish({
    entity: base44.entities.Devotional,
    dateField: "reading_date",
    build: (p) => {
      const ref = (p.scripture_reference || "").trim();
      const verse = (p.verse_text || "").trim();
      return {
        title: ref,
        scripture_reference: ref,
        verse_text: verse,
        content: verse,
        reading_date: p.reading_date,
        language: "fr",
      };
    },
    // Une seule entrée par date : l'entrée déjà programmée à ce jour est
    // mise à jour au lieu de créer un doublon affiché deux fois.
    resolveId: (d, prev, server) => d.id ?? prev?.id ?? server?.id ?? undefined,
  });

  const load = async () => {
    try {
      const today = toISODate();
      const [todayDevs, recent] = await Promise.all([
        base44.entities.Devotional
          .filter({ reading_date: today }, "-reading_date", 1)
          .catch(() => []),
        base44.entities.Devotional.list("-reading_date", 100).catch(() => []),
      ]);
      const list = Array.isArray(recent) ? recent : [];
      const current =
        Array.isArray(todayDevs) && todayDevs[0] ? todayDevs[0] : null;
      // Repli : le dernier verset antérieur à aujourd'hui, en excluant
      // explicitement les dates futures. C'était le bug : on prenait le
      // dernier dévotional créé, donc un verset programmé pour plus tard
      // s'affichait immédiatement.
      const past =
        list.find((d) => isISODate(d.reading_date) && d.reading_date < today) ||
        null;
      setTodayDev(current);
      setDevotional(current || past || null);
    } finally {
      setLoading(false);
    }
  };

  // Chargé à l'ouverture de la fenêtre : `all` ne contient QUE le planning
  // complet, pour qu'un rafraîchissement de l'accueil ne le remplace jamais
  // par la courte liste récente (l'historique disparaîtrait alors à l'écran).
  const loadPlanning = async () => {
    setPlanningLoading(true);
    try {
      const rows = await base44.entities.Devotional
        .list("-reading_date", PLANNING_LIMIT)
        .catch(() => []);
      setAll(Array.isArray(rows) ? rows : []);
    } finally {
      setPlanningLoading(false);
    }
  };

  useEffect(() => {
    if (isLocalMode) { setLoading(false); return; }
    load();
  }, [refreshKey, isLocalMode]);

  const openEdit = () => {
    // On repart du verset affiché mais on cible AUJOURD'HUI : enregistrer
    // comble le trou du jour plutôt que de retoucher un verset déjà passé.
    const base = todayDev || devotional;
    setDraft({
      // Seule l'entrée datée d'aujourd'hui est ciblée : préremplir depuis un
      // verset passé ne doit pas le déplacer sur aujourd'hui.
      id: todayDev?.id,
      scripture_reference: base?.scripture_reference || "",
      verse_text: base?.verse_text || base?.title || "",
      reading_date: toISODate(),
    });
    setEditing(true);
    loadPlanning();
  };

  // Clic sur une ligne du planning : charge ce jour dans le formulaire.
  const editOn = (day, entry) => {
    setDraft({
      id: entry?.id,
      scripture_reference: entry?.scripture_reference || "",
      verse_text: entry?.verse_text || entry?.title || "",
      reading_date: day,
    });
  };

  // Enregistre le formulaire dans la file « à publier » (rien n'est envoyé)
  // et passe au jour suivant pour enchaîner les saisies.
  const stageCurrent = () => {
    const day = draft.reading_date;
    const ref = draft.scripture_reference.trim();
    const verse = draft.verse_text.trim();
    if (!ref || !verse) {
      toast({ title: "Référence et verset requis", variant: "destructive" });
      return;
    }
    if (!isISODate(day)) {
      toast({ title: "Date invalide", variant: "destructive" });
      return;
    }
    const res = stage(draft, all);
    if (!res.ok) {
      toast({ title: res.error, variant: "destructive" });
      return;
    }
    toast({
      title: "Ajouté à la liste",
      description: `${res.pendingCount} en attente — rien n'est encore publié.`,
    });
    setDraft({
      id: undefined,
      scripture_reference: "",
      verse_text: "",
      reading_date: addDaysISO(day, 1),
    });
  };

  // Écrit toute la file d'un coup.
  const publishAll = async () => {
    const res = await publish(all);
    if (res.failed) {
      toast({
        title: "Publication partielle",
        description: `${res.ok} publié(s), ${res.failed} en échec.`,
        variant: "destructive",
      });
      await load();
      await loadPlanning();
      return; // la fenêtre reste ouverte pour retenter celles qui ont échoué
    }
    toast({
      title: "Publication réussie",
      description: `${res.ok} verset(s) programmé(s).`,
    });
    setEditing(false);
    await load();
    await loadPlanning();
  };

  // Fermeture : les entrées en attente restent dans la fenêtre (on peut la
  // rouvrir et tout y est) — le rappel le dit explicitement.
  const closeDialog = (open) => {
    if (!open && pending.length) {
      toast({
        title: `${pending.length} verset(s) en attente`,
        description:
          "Ils restent dans la fenêtre si tu la rouvres (perdus seulement si tu recharges la page).",
      });
    }
    setEditing(open);
  };

  const removeOn = async (entry) => {
    // Entrée en attente : on la retire de la file, aucun appel serveur.
    if (entry.__pending) {
      discard(entry.reading_date);
      toast({ title: "Retiré de la liste", description: "Rien n'était publié." });
      return;
    }
    const when = formatISODate(entry.reading_date, { long: true });
    if (!(await confirmFr({ title: "Supprimer le verset ?", message: `Verset du ${when}.`, confirmLabel: "Supprimer" }))) return;
    try {
      await base44.entities.Devotional.delete(entry.id);
      toast({ title: "Verset supprimé", description: when });
      await load();
      await loadPlanning();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const shareVerse = async () => {
    const url = getPublicOrigin();
    let text;
    if (devotional) {
      const ref = devotional.scripture_reference || "";
      const colon = ref.lastIndexOf(":");
      const verseNum = colon >= 0 ? ref.slice(colon + 1).trim() : "";
      const verseText = devotional.verse_text || devotional.title || "";
      text = `${ref} LSG\n${verseNum ? `[${verseNum}] ` : ""}${verseText}\n${url}`;
    } else {
      text = `Philippiens 4:13 LSG\n[13] Je puis tout par celui qui me fortifie.\n${url}`;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "Verset du jour", text });
      } catch {
        /* cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Verset copié" });
      } catch {
        /* ignore */
      }
    }
  };

  const chapterLink = devotional?.scripture_reference
    ? `/bible?ref=${encodeURIComponent(devotional.scripture_reference)}&translation=fra_lsg`
    : "/bible";

  // ── Indication affichée sous le champ date ────────────────────────────
  const today = toISODate();

  const dateHint = !isISODate(draft.reading_date)
    ? "Choisissez une date d'affichage."
    : draft.reading_date < today
      ? "Date passée : ce verset ne s'affichera plus automatiquement."
      : draft.reading_date === today
        ? "S'affiche aujourd'hui."
        : `S'affichera automatiquement le ${formatISODate(draft.reading_date, { long: true })}.`;

  return (
    <section className={adminOnly ? "" : "mt-6"}>
      {/* Panneau admin : même fenêtre « Programmer le verset du jour » que sur
          l'accueil, ouverte par un bouton à la place de la carte. */}
      {adminOnly && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Chargement…"
              : devotional
                ? `Verset affiché : ${devotional.scripture_reference || devotional.title}`
                : "Aucun verset programmé."}
          </p>
          <Button onClick={openEdit} className="rounded-full">
            <Plus className="h-4 w-4 mr-1.5" /> Ajouter / Modifier
          </Button>
        </div>
      )}
      {/* Format ramené à celui du widget Préc./Nouv. juste en dessous : mêmes
          retraits (1,5–1,5), texte réduit, bouton discret — la carte ne doit
          plus écraser le reste de l'accueil. */}
      <div className={`${adminOnly ? "hidden " : ""}rounded-[1.5rem] brand-gradient p-4 md:p-6 text-white relative overflow-hidden glow-primary`}>
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              <BookOpen className="h-3.5 w-3.5" /> Verset du jour
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && !editing && (
                <button
                  onClick={openEdit}
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1 text-xs font-bold transition"
                >
                  <Pencil className="h-3.5 w-3.5" /> {devotional ? "Modifier" : "Ajouter"}
                </button>
              )}
              <button
                onClick={shareVerse}
                className="h-7 w-7 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 transition"
                aria-label="Partager le verset"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="mt-4 space-y-2">
              <div className="h-5 w-3/4 bg-white/20 rounded animate-pulse" />
              <div className="h-5 w-2/3 bg-white/20 rounded animate-pulse" />
            </div>
          ) : devotional ? (
            <>
              <p className="selectable mt-3 text-sm md:text-base font-light leading-snug font-body">
                « {devotional.verse_text || devotional.title} »
              </p>
              <p className="mt-1.5 text-xs font-medium text-white/75 font-body">
                — {devotional.scripture_reference}
              </p>
              {/* Rappel admin : la carte montre un verset antérieur faute
                  d'entrée pour aujourd'hui. */}
              {isAdmin && !todayDev && isISODate(devotional.reading_date) && (
                <p className="mt-1 text-xs text-white/70 font-body">
                  Aucun verset programmé pour aujourd'hui — dernier publié le{" "}
                  {formatISODate(devotional.reading_date, { long: true })}.
                </p>
              )}
              <Link
                to={chapterLink}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-white text-neutral-900 px-4 py-2 text-xs font-bold hover:scale-105 transition"
              >
                Lire le chapitre <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="selectable mt-3 text-sm md:text-base font-light leading-snug font-body">
              « Je puis tout par celui qui me fortifie. » — Philippiens 4:13
            </p>
          )}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Programmer le verset du jour</DialogTitle>
            <DialogDescription>
              Choisissez la date d'affichage : le verset apparaît seul sur
              l'accueil le jour choisi, sans autre action.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vd-date">Date d'affichage</Label>
              <Input
                id="vd-date"
                type="date"
                value={draft.reading_date}
                onChange={(e) =>
                  // Changer la date repart d'une nouvelle entrée : le brouillon
                  // ne doit plus cibler l'entrée du jour précédent.
                  setDraft((d) => ({
                    ...d,
                    reading_date: e.target.value,
                    id: undefined,
                  }))
                }
                className="selectable"
              />
              <p className="text-xs text-muted-foreground">{dateHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vd-ref">Référence</Label>
              <Input
                id="vd-ref"
                value={draft.scripture_reference}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, scripture_reference: e.target.value }))
                }
                placeholder="Philippiens 4:13"
                className="selectable"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vd-verse">Texte du verset</Label>
              <Textarea
                id="vd-verse"
                value={draft.verse_text}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, verse_text: e.target.value }))
                }
                rows={4}
                placeholder="Je puis tout par celui qui me fortifie."
                className="selectable"
              />
            </div>

            <Button
              variant="outline"
              onClick={stageCurrent}
              disabled={publishing}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Enregistrer dans la liste
            </Button>
          </div>

          <PeriodPlanner
            today={today}
            focusDate={draft.reading_date}
            entries={[...pending, ...all]}
            dateField="reading_date"
            labelFor={(e) => e.scripture_reference || e.title || ""}
            onPick={editOn}
            onDelete={removeOn}
            loading={planningLoading}
            pendingCount={pending.length}
          />

          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => closeDialog(false)}
              disabled={publishing}
            >
              <X className="h-4 w-4 mr-1.5" /> Fermer
            </Button>
            <Button
              onClick={publishAll}
              disabled={publishing || planningLoading || !pending.length}
            >
              {publishing
                ? "Publication…"
                : pending.length
                  ? `Publier (${pending.length})`
                  : "Publier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}