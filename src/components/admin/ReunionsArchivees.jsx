import React, { useEffect, useState } from "react";
import { Archive, Loader2, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { formatHeure, heureReunion, meetingDateOf } from "@/lib/upcomingEvents";
import { formatISODate } from "@/lib/localDate";

// Panneau admin, section Annonces : réunions archivées automatiquement (heure passée, tâche serveur
// reunions_archivage). Masquées aux membres ; ici, l'admin les voit et peut en restaurer une.
export default function ReunionsArchivees({ refreshKey = 0 }) {
  const { toast } = useToast();
  const [liste, setListe] = useState(null);

  const charger = async () => {
    const rows = await base44.entities.Announcement
      .filter({ type: "event", archived: true }, "-event_date", 200)
      .catch(() => []);
    setListe(Array.isArray(rows) ? rows : []);
  };

  useEffect(() => { charger(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const restaurer = async (r) => {
    try {
      await base44.entities.Announcement.update(r.id, { archived: false });
      toast({ title: "Réunion restaurée", description: "Elle sera de nouveau archivée si son heure est passée." });
      charger();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4" aria-labelledby="reunions-archivees">
      <div className="flex items-center gap-2 mb-3">
        <Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 id="reunions-archivees" className="font-bold">Archivées</h3>
        {liste && <span className="text-xs text-muted-foreground">({liste.length})</span>}
      </div>
      {liste === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : liste.length === 0 ? (
        <p className="text-sm text-foreground/50">Aucune réunion archivée.</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm break-words">{r.title}</div>
                <div className="text-xs text-muted-foreground">
                  {formatISODate(meetingDateOf(r))}
                  {heureReunion(r) ? ` à ${formatHeure(heureReunion(r))}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => restaurer(r)}
                className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted shrink-0"
                aria-label={`Restaurer ${r.title}`}
                title="Restaurer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
