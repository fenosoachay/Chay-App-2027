import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Bell, CalendarDays, Clock, Pencil, Plus, X } from "lucide-react";
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
  fromISODate,
  formatISODate,
  isISODate,
  addDaysISO,
} from "@/lib/localDate";
import PeriodPlanner from "@/components/home/PeriodPlanner";
import useStagedPublish from "@/hooks/useStagedPublish";
import { confirmFr } from "@/lib/confirmFr";

// Les réunions sont espacées : 500 annonces de type « event » couvrent
// plusieurs années d'historique.
const PLANNING_LIMIT = 500;

// Prochaine réunion : affiche l'événement le plus proche à venir (aujourd'hui
// ou plus tard) et permet à un administrateur de le programmer à l'avance,
// avec le même système que le verset du jour (date d'affichage + planning).
// Une réunion passée n'est jamais supprimée avec le temps : elle reste
// consultable dans le planning via « Précédents ».
export default function ProchaineReunionSection({ refreshKey = 0, adminOnly = false, onChanged }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [reunion, setReunion] = useState(null);
  const [events, setEvents] = useState([]); // réunions chargées (planning)
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [draft, setDraft] = useState({
    id: undefined, // entrée sélectionnée dans le planning ; undefined = nouvelle
    title: "",
    body: "",
    date: toISODate(), // date de publication (clé du planning)
    event_date: "", // date de la réunion affichée sur la carte
    __legacy: false, // annonce d'avant les deux dates : comportement inchangé
  });

  // File « à publier » : on enregistre plusieurs réunions dans la fenêtre,
  // rien ne part au serveur, puis un seul « Publier » les écrit toutes.
  const { pending, publishing, stage, discard, publish } = useStagedPublish({
    entity: base44.entities.Announcement,
    dateField: "date",
    build: (p) => {
      const payload = {
        title: (p.title || "").trim(),
        body: (p.body || "").trim() || "",
        date: p.date,
        type: "event",
        language: "fr",
      };
      if (p.event_date) {
        payload.event_date = p.event_date;
      } else if (!p.__legacy) {
        // Nouvelle annonce sans date de réunion saisie : la réunion a lieu le
        // même jour que la publication.
        payload.event_date = p.date;
      }
      // Annonce ancienne laissée telle quelle : on n'ajoute pas le champ, son
      // affichage reste exactement celui d'avant.
      return payload;
    },
    // On met à jour l'entrée sélectionnée ; à défaut on en crée une. Une
    // collision de date est REFUSÉE plutôt qu'écrasée : deux réunions peuvent
    // cohabiter un même jour, remplacer silencieusement l'autre ferait perdre
    // son contenu. `null` = date déjà occupée.
    resolveId: (d, prev, server) => {
      const id = d.id ?? prev?.id ?? undefined;
      return id === undefined && server ? null : id;
    },
  });

  // Date de réunion affichée : les annonces d'avant la séparation des deux
  // dates n'ont pas de `event_date` — leur unique date servait des deux rôles.
  const meetingOf = (a) => a.event_date || a.date;

  // Prochaine réunion à venir : réunion pas encore passée ET affiche déjà
  // publiée. Exemple : l'affiche est publiée demain, la réunion est dimanche
  // → rien aujourd'hui, la carte apparaît demain et affiche « dimanche ».
  // Une annonce sans date de réunion distincte garde l'ancien comportement
  // (visible tant que sa date n'est pas passée).
  const upcomingOf = (list) => {
    const now = toISODate();
    const upcoming = list
      .filter((a) => {
        const evt = meetingOf(a);
        return evt >= now && (!a.event_date || a.date <= now);
      })
      .sort((a, b) =>
        meetingOf(a) < meetingOf(b) ? -1 : meetingOf(a) > meetingOf(b) ? 1 : 0
      );
    return upcoming[0] || null;
  };

  const loadEvents = async (limit) => {
    const rows = await base44.entities.Announcement
      .filter({ type: "event" }, "-date", limit)
      .catch(() => []);
    return (Array.isArray(rows) ? rows : []).filter((a) => isISODate(a.date));
  };

  const load = async () => {
    try {
      const list = await loadEvents(100);
      setReunion(upcomingOf(list));
    } finally {
      setLoading(false);
    }
  };

  // Chargé à l'ouverture de la fenêtre : `events` ne contient QUE le planning
  // complet, pour qu'un rafraîchissement de l'accueil ne le remplace jamais
  // par la courte liste récente (l'historique disparaîtrait alors à l'écran).
  const loadPlanning = async () => {
    setPlanningLoading(true);
    try {
      const list = await loadEvents(PLANNING_LIMIT);
      setEvents(list);
      setReunion(upcomingOf(list));
    } finally {
      setPlanningLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const openEdit = () => {
    const base = reunion;
    setDraft({
      id: base?.id,
      title: base?.title || "",
      body: base?.body || "",
      date: base?.date || toISODate(),
      // Vide = annonce ancienne (une seule date) : son comportement reste
      // inchangé. Nouvelle annonce : la réunion a lieu le même jour que la
      // publication tant que le champ n'est pas rempli.
      event_date: base?.event_date || "",
      __legacy: Boolean(base?.id) && !base?.event_date,
    });
    setEditing(true);
    loadPlanning();
  };

  // Clic sur une ligne du planning : charge ce jour dans le formulaire.
  const editOn = (day, entry) => {
    setDraft({
      id: entry?.id,
      title: entry?.title || "",
      body: entry?.body || "",
      date: day,
      event_date: entry?.event_date || "",
      __legacy: Boolean(entry?.id) && !entry?.event_date,
    });
  };

  // Enregistre le formulaire dans la file « à publier » (rien n'est envoyé)
  // et repart sur une nouvelle réunion pour enchaîner les saisies.
  const stageCurrent = () => {
    const title = draft.title.trim();
    const day = draft.date;
    if (!title) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (!isISODate(day)) {
      toast({ title: "Date invalide", variant: "destructive" });
      return;
    }
    if (draft.event_date && !isISODate(draft.event_date)) {
      toast({ title: "Date de réunion invalide", variant: "destructive" });
      return;
    }
    const res = stage(
      draft,
      events,
      "Une réunion existe déjà à cette date — clique sur le crayon de cette journée dans le planning pour la modifier."
    );
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
      title: "",
      body: "",
      date: addDaysISO(day, 1),
      event_date: "",
      __legacy: false,
    });
  };

  // Écrit toute la file d'un coup.
  const publishAll = async () => {
    const res = await publish(events);
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
      description: `${res.ok} réunion(s) programmée(s).`,
    });
    setEditing(false);
    await load();
    await loadPlanning();
    onChanged?.();
  };

  // Fermeture : les entrées en attente restent dans la fenêtre (on peut la
  // rouvrir et tout y est) — le rappel le dit explicitement.
  const closeDialog = (open) => {
    if (!open && pending.length) {
      toast({
        title: `${pending.length} réunion(s) en attente`,
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
    if (!(await confirmFr({ title: "Supprimer la réunion ?", message: `Réunion du ${when}.`, confirmLabel: "Supprimer" }))) return;
    try {
      await base44.entities.Announcement.delete(entry.id);
      toast({ title: "Réunion supprimée", description: when });
      await load();
      await loadPlanning();
      onChanged?.();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const today = toISODate();
  const dateHint = !isISODate(draft.date)
    ? "Choisissez une date de publication."
    : draft.date < today
      ? "Déjà publié : l'affiche reste affichée jusqu'à la date de la réunion."
      : draft.date === today
        ? "Publié aujourd'hui."
        : `L'affiche apparaîtra automatiquement le ${formatISODate(draft.date, { long: true })}.`;

  const meetingHint = !draft.event_date
    ? "Vide : la réunion a lieu le même jour que la publication."
    : !isISODate(draft.event_date)
      ? "Date de réunion invalide."
      : isISODate(draft.date) && draft.event_date < draft.date
        ? "La réunion est antérieure à la publication : elle n'apparaîtra pas sur l'accueil."
        : `Date affichée sur la carte : ${formatISODate(draft.event_date, { long: true })}.`;

  const reunionDate = reunion
    ? fromISODate(meetingOf(reunion))?.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <section className={adminOnly ? "mb-4" : "mt-6"}>
      {/* Panneau admin : même fenêtre « Programmer la prochaine réunion » que
          sur l'accueil, ouverte par un bouton à la place de la carte. */}
      {adminOnly && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <p className="text-sm text-muted-foreground min-w-0 truncate">
            {loading
              ? "Chargement…"
              : reunion
                ? `Prochaine réunion : ${reunion.title}`
                : "Aucune réunion annoncée."}
          </p>
          <Button onClick={openEdit} className="rounded-full shrink-0">
            <Plus className="h-4 w-4 mr-1.5" /> Ajouter / Modifier
          </Button>
        </div>
      )}
      <div className={`${adminOnly ? "hidden " : ""}rounded-[1.5rem] border border-border bg-card p-5 md:p-8`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="font-display font-extrabold text-base md:text-xl">
              Prochaine réunion
            </h2>
          </div>
          {isAdmin && !editing && (
            <button
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary transition"
            >
              <Pencil className="h-3.5 w-3.5" /> {reunion ? "Modifier" : "Ajouter"}
            </button>
          )}
        </div>
        {loading ? (
          <div className="h-16 bg-background rounded-2xl animate-pulse" />
        ) : reunion ? (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary shrink-0">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-sm md:text-lg">{reunion.title}</div>
              {reunion.body && (
                <div className="text-foreground/60 text-xs md:text-sm mt-1">
                  {reunion.body}
                </div>
              )}
              {reunionDate && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs md:text-sm font-semibold text-primary">
                  <Clock className="h-3.5 w-3.5" /> {reunionDate}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground/50">
            Aucune réunion annoncée pour le moment.
          </p>
        )}
      </div>

      <Dialog open={editing} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Programmer la prochaine réunion</DialogTitle>
            <DialogDescription>
              La date de publication programme l'apparition de l'affiche sur
              l'accueil ; la date de la réunion est celle affichée sur la
              carte. Elles peuvent être différentes : publié demain, réunion
              dimanche.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pr-title">Titre</Label>
              <Input
                id="pr-title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Réunion de prière"
                className="selectable"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-body">Description</Label>
              <Textarea
                id="pr-body"
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                rows={3}
                placeholder="Détails de la réunion…"
                className="selectable"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-date">Date de publication</Label>
              <Input
                id="pr-date"
                type="date"
                value={draft.date}
                onChange={(e) =>
                  // Changer la date repart d'une nouvelle réunion : le
                  // brouillon ne doit plus cibler l'entrée du jour précédent.
                  setDraft((d) => ({ ...d, date: e.target.value, id: undefined }))
                }
                className="selectable"
              />
              <p className="text-xs text-muted-foreground">{dateHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-event-date">Date de la réunion</Label>
              <Input
                id="pr-event-date"
                type="date"
                value={draft.event_date}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, event_date: e.target.value }))
                }
                className="selectable"
              />
              <p className="text-xs text-muted-foreground">{meetingHint}</p>
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
            entries={[...pending, ...events]}
            dateField="date"
            labelFor={(e) => {
              // La ligne = date de publication ; on rappelle la date de la
              // réunion quand elle est différente.
              const title = e.title || "";
              return e.event_date && e.event_date !== e.date
                ? `${title} · ${formatISODate(e.event_date)}`
                : title;
            }}
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