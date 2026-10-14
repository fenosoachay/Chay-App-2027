import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Brain, Pencil, X, Plus } from "lucide-react";
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

// Question logique du jour : même système que le verset du jour. On publie
// depuis une boîte de dialogue avec une date d'affichage et un planning des
// 30 jours ; l'affichage est automatique (l'entrée datée d'aujourd'hui, sinon
// le dernier passé — jamais une date future). Une question passée reste
// consultable dans le planning, elle n'est jamais supprimée avec le temps.
export default function QuestionLogiqueSection({ refreshKey = 0 }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [item, setItem] = useState(null); // question affichée
  const [todayItem, setTodayItem] = useState(null); // question d'aujourd'hui
  const [all, setAll] = useState([]); // entrées chargées, pour le planning
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [draft, setDraft] = useState({
    id: undefined, // id de l'entrée serveur que le formulaire modifie
    text: "",
    date: toISODate(),
  });

  // File « à publier » : on enregistre plusieurs questions dans la fenêtre,
  // rien ne part au serveur, puis un seul « Publier » les écrit toutes.
  const { pending, publishing, stage, discard, publish } = useStagedPublish({
    entity: base44.entities.QuestionLogique,
    dateField: "date",
    build: (p) => ({ text: (p.text || "").trim(), date: p.date }),
    // Une seule question par date : l'entrée déjà publiée à ce jour est mise
    // à jour au lieu de créer un doublon.
    resolveId: (d, prev, server) => d.id ?? prev?.id ?? server?.id ?? undefined,
  });

  const load = async () => {
    try {
      const today = toISODate();
      const [todayItems, recent] = await Promise.all([
        base44.entities.QuestionLogique
          .filter({ date: today }, "-date", 1)
          .catch(() => []),
        base44.entities.QuestionLogique.list("-date", 100).catch(() => []),
      ]);
      const list = Array.isArray(recent) ? recent : [];
      const current =
        Array.isArray(todayItems) && todayItems[0] ? todayItems[0] : null;
      // Repli : le dernier passé, en excluant explicitement les dates
      // futures (l'ancien code prenait la dernière question créée, donc une
      // question programmée pour plus tard s'affichait aussitôt).
      const past =
        list.find((q) => isISODate(q.date) && q.date < today) || null;
      setTodayItem(current);
      setItem(current || past || null);
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
      const rows = await base44.entities.QuestionLogique
        .list("-date", PLANNING_LIMIT)
        .catch(() => []);
      setAll(Array.isArray(rows) ? rows : []);
    } finally {
      setPlanningLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const openEdit = () => {
    // On repart de la question affichée mais on cible AUJOURD'HUI :
    // enregistrer comble le trou du jour plutôt que de retoucher une
    // question passée.
    const base = todayItem || item;
    setDraft({
      // Seule l'entrée datée d'aujourd'hui est ciblée : préremplir depuis
      // une question passée ne doit pas la déplacer sur aujourd'hui.
      id: todayItem?.id,
      text: base?.text || "",
      date: toISODate(),
    });
    setEditing(true);
    loadPlanning();
  };

  // Clic sur une ligne du planning : charge ce jour dans le formulaire.
  const editOn = (day, entry) => {
    setDraft({ id: entry?.id, text: entry?.text || "", date: day });
  };

  // Enregistre le formulaire dans la file « à publier » (rien n'est envoyé)
  // et passe au jour suivant pour enchaîner les saisies.
  const stageCurrent = () => {
    const day = draft.date;
    const text = draft.text.trim();
    if (!text) {
      toast({ title: "Texte vide", variant: "destructive" });
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
    setDraft({ id: undefined, text: "", date: addDaysISO(day, 1) });
  };

  // Écrit toute la file d'un coup.
  const publishAll = async () => {
    const res = await publish(all);
    if (res.failed) {
      toast({
        title: "Publication partielle",
        description: `${res.ok} publiée(s), ${res.failed} en échec.`,
        variant: "destructive",
      });
      await load();
      await loadPlanning();
      return; // la fenêtre reste ouverte pour retenter celles qui ont échoué
    }
    toast({
      title: "Publication réussie",
      description: `${res.ok} question(s) programmée(s).`,
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
        title: `${pending.length} question(s) en attente`,
        description:
          "Elles restent dans la fenêtre si tu la rouvres (perdus seulement si tu recharges la page).",
      });
    }
    setEditing(open);
  };

  const removeOn = async (entry) => {
    // Entrée en attente : on la retire de la file, aucun appel serveur.
    if (entry.__pending) {
      discard(entry.date);
      toast({ title: "Retiré de la liste", description: "Rien n'était publié." });
      return;
    }
    const when = formatISODate(entry.date, { long: true });
    if (!(await confirmFr({ title: "Supprimer la question ?", message: `Question du ${when}.`, confirmLabel: "Supprimer" }))) return;
    try {
      await base44.entities.QuestionLogique.delete(entry.id);
      toast({ title: "Question supprimée", description: when });
      await load();
      await loadPlanning();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const today = toISODate();
  const dateHint = !isISODate(draft.date)
    ? "Choisissez une date d'affichage."
    : draft.date < today
      ? "Date passée : cette question ne s'affichera plus automatiquement."
      : draft.date === today
        ? "S'affiche aujourd'hui."
        : `S'affichera automatiquement le ${formatISODate(draft.date, { long: true })}.`;

  return (
    <section className="mt-6">
      <div className="rounded-[1.5rem] md:rounded-[2rem] border border-border bg-card p-5 md:p-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center h-9 w-9 rounded-xl bg-secondary/10 text-secondary">
              <Brain className="h-5 w-5" />
            </div>
            <h2 className="font-display font-extrabold text-base md:text-lg">Question Logique</h2>
          </div>
          {isAdmin && !editing && (
            <button
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary transition"
            >
              <Pencil className="h-3.5 w-3.5" /> {item ? "Modifier" : "Ajouter"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="h-16 bg-background rounded-2xl animate-pulse" />
        ) : item ? (
          <>
            <p className="selectable text-sm md:text-base leading-relaxed text-foreground/80">
              {item.text}
            </p>
            {/* Rappel admin : la carte montre une question antérieure faute
                d'entrée pour aujourd'hui. */}
            {isAdmin && !todayItem && isISODate(item.date) && (
              <p className="mt-2 text-xs text-foreground/50">
                Aucune question pour aujourd'hui — dernière publiée le{" "}
                {formatISODate(item.date, { long: true })}.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-foreground/50">
            {isAdmin
              ? "Aucune question logique publiée. Cliquez sur « Ajouter »."
              : "Aucune question logique pour aujourd'hui."}
          </p>
        )}
      </div>

      <Dialog open={editing} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Programmer la question logique</DialogTitle>
            <DialogDescription>
              Choisissez la date d'affichage : la question apparaît seule sur
              l'accueil le jour choisi, sans autre action.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ql-date">Date d'affichage</Label>
              <Input
                id="ql-date"
                type="date"
                value={draft.date}
                onChange={(e) =>
                  // Changer la date repart d'une nouvelle entrée : le
                  // brouillon ne doit plus cibler l'entrée du jour précédent.
                  setDraft((d) => ({
                    ...d,
                    date: e.target.value,
                    id: undefined,
                  }))
                }
                className="selectable"
              />
              <p className="text-xs text-muted-foreground">{dateHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ql-text">Question</Label>
              <Textarea
                id="ql-text"
                value={draft.text}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, text: e.target.value }))
                }
                rows={4}
                placeholder="Saisissez la question logique du jour…"
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
            focusDate={draft.date}
            entries={[...pending, ...all]}
            dateField="date"
            labelFor={(e) => e.text || ""}
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