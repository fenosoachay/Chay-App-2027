import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import {
  addDaysISO,
  formatISODate,
  fromISODate,
  isISODate,
} from "@/lib/localDate";

// Fenêtre de programmation : 30 jours affichés d'un coup, ancrés sur
// aujourd'hui (aujourd'hui → +29, puis la période précédente, suivante…).
// Les entrées passées ne sont jamais supprimées avec le temps : on navigue
// vers la période voulue pour les consulter (« le verset du 26.06 reste
// visible »).
export const PLANNING_DAYS = 30;

const DAY_MS = 86400000;

const diffDays = (from, to) => {
  const a = fromISODate(from);
  const b = fromISODate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
};

// Début de fenêtre (multiple de 30 jours après aujourd'hui) qui contient `iso`.
const startContaining = (iso, today) => {
  const idx = Math.floor(diffDays(today, iso) / PLANNING_DAYS);
  return addDaysISO(today, idx * PLANNING_DAYS);
};

/**
 * Planning des 30 jours, avec navigation par période.
 *
 * @param today      date du jour (YYYY-MM-DD)
 * @param focusDate  date saisie dans le formulaire : la fenêtre la suit
 *                   automatiquement si elle tombe en dehors
 * @param entries    toutes les entrées déjà chargées
 * @param dateField  nom du champ date de l'entité
 * @param labelFor   libellé affiché pour une ligne remplie
 * @param onPick     (day, entry?) => void — modifier ce jour, ou le créer
 * @param onDelete   (entry) => void
 * @param loading    pendant le chargement des entrées
 * @param pendingCount  entrées en attente dans la file « à publier »
 */
export default function PeriodPlanner({
  today,
  focusDate,
  entries,
  dateField,
  labelFor,
  onPick,
  onDelete,
  allowMultiplePerDate = false,
  loading = false,
  pendingCount = 0,
}) {
  const [start, setStart] = useState(() => startContaining(today, today));
  const startRef = useRef(start);
  startRef.current = start;

  // Une date choisie hors de la fenêtre affichée y fait défiler la liste
  // (choisir le 26.06 affiche la fenêtre de juin). On lit startRef plutôt que
  // start dans les dépendances : la navigation manuelle ne doit pas être
  // annulée par une remontée sur la date saisie.
  useEffect(() => {
    if (!isISODate(focusDate)) return;
    const from = startRef.current;
    const to = addDaysISO(from, PLANNING_DAYS - 1);
    if (focusDate < from || focusDate > to) {
      setStart(startContaining(focusDate, today));
    }
  }, [focusDate, today]);

  const end = addDaysISO(start, PLANNING_DAYS - 1);

  const byDate = {};
  for (const entry of entries || []) {
    const day = entry?.[dateField];
    if (!isISODate(day)) continue;
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(entry);
  }

  const days = Array.from({ length: PLANNING_DAYS }, (_, k) =>
    addDaysISO(start, k)
  );
  const filled = days.filter((d) => byDate[d]).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">
          {formatISODate(start)} → {formatISODate(end)}
        </span>
        <span className="text-xs text-muted-foreground">
          {filled}/{PLANNING_DAYS} remplis
          {pendingCount > 0 ? ` · ${pendingCount} à publier` : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStart(addDaysISO(start, -PLANNING_DAYS))}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-bold hover:border-primary transition"
          aria-label="30 jours précédents"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Précédents
        </button>
        <button
          type="button"
          onClick={() => setStart(startContaining(today, today))}
          disabled={start === today}
          className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary transition disabled:opacity-50 disabled:hover:border-border"
        >
          Aujourd'hui
        </button>
        <button
          type="button"
          onClick={() => setStart(addDaysISO(start, PLANNING_DAYS))}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-bold hover:border-primary transition"
          aria-label="30 jours suivants"
        >
          Suivants <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
          <div className="h-4 w-3/5 bg-muted rounded animate-pulse" />
        </div>
      ) : (
        <ul className="rounded-xl border border-border divide-y divide-border max-h-56 overflow-y-auto">
          {days.map((day) => {
            const dayEntries = byDate[day] || [];
            const entry = dayEntries[0];
            const isToday = day === today;
            return (
              <li
                key={day}
                className={`flex items-center gap-2 px-3 py-2 ${
                  day === focusDate ? "bg-muted" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-xs font-bold ${
                      isToday ? "text-primary" : "text-foreground/80"
                    }`}
                  >
                    {formatISODate(day)}
                    {isToday ? " · aujourd'hui" : ""}
                  </div>
                  {allowMultiplePerDate ? (
                    dayEntries.length ? (
                      <ul className="space-y-1">
                        {dayEntries.map((item, index) => (
                          <li key={item.__pendingKey || item.id || `${day}-${index}`} className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-muted-foreground truncate">
                              {labelFor(item)}
                            </span>
                            {item.__pending && (
                              <span className="shrink-0 rounded-full bg-primary/10 text-primary px-1.5 text-2xs font-bold uppercase">
                                à publier
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => onPick(day, item)}
                              className="h-6 w-6 grid place-items-center rounded-full border border-border hover:bg-muted transition shrink-0"
                              aria-label={`Modifier ${labelFor(item)} du ${formatISODate(day)}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(item)}
                              className="h-6 w-6 grid place-items-center rounded-full border border-border hover:bg-destructive/10 hover:text-destructive transition shrink-0"
                              aria-label={`Supprimer ${labelFor(item)} du ${formatISODate(day)}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-muted-foreground">— vide —</span>
                    )
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-muted-foreground truncate">
                        {entry ? labelFor(entry) : "— vide —"}
                      </span>
                      {entry?.__pending && (
                        <span className="shrink-0 rounded-full bg-primary/10 text-primary px-1.5 text-2xs font-bold uppercase">
                          à publier
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {!allowMultiplePerDate && <button
                  type="button"
                  onClick={() => onPick(day, entry)}
                  className="h-7 w-7 grid place-items-center rounded-full border border-border hover:bg-muted transition shrink-0"
                  aria-label={
                    entry
                      ? `Modifier le ${formatISODate(day)}`
                      : `Ajouter le ${formatISODate(day)}`
                  }
                >
                  {entry ? (
                    <Pencil className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </button>}
                {allowMultiplePerDate && (
                  <button
                    type="button"
                    onClick={() => onPick(day)}
                    className="h-7 w-7 grid place-items-center rounded-full border border-border hover:bg-muted transition shrink-0"
                    aria-label={`Ajouter une entrée le ${formatISODate(day)}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
                {!allowMultiplePerDate && entry && (
                  <button
                    type="button"
                    onClick={() => onDelete(entry)}
                    className="h-7 w-7 grid place-items-center rounded-full border border-border hover:bg-destructive/10 hover:text-destructive transition shrink-0"
                    aria-label={`Supprimer l'entrée du ${formatISODate(day)}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Rien n'est effacé quand la date passe : les périodes antérieures restent
        consultables avec « Précédents ». Une date plus lointaine se programme
        avec le champ date.
      </p>
    </div>
  );
}
