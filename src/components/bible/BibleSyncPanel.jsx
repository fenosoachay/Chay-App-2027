import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { IS_POCKETBASE } from "@/api/backendConfig";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

const TRANSLATIONS = [
  { id: "lsg1910", name: "Louis Segond 1910 (Français)" },
  { id: "malagasy", name: "Baiboly Malagasy 1865" },
];

// Panneau d'administration pour synchroniser l'index de recherche plein
// texte (entité BibleVerse) à partir des sources déjà utilisées par le
// lecteur. La synchronisation malgache se fait par lots (reprise possible).
export default function BibleSyncPanel() {
  const [records, setRecords] = useState({});
  const [running, setRunning] = useState({});
  const [log, setLog] = useState({});

  const load = async () => {
    const list = await base44.entities.BibleTranslation.list().catch(() => []);
    const map = {};
    (Array.isArray(list) ? list : []).forEach((r) => { map[r.translation_id] = r; });
    setRecords(map);
  };

  useEffect(() => { load(); }, []);

  async function runSync(translationId) {
    setRunning((p) => ({ ...p, [translationId]: true }));
    setLog((p) => ({ ...p, [translationId]: "Démarrage de la synchronisation…" }));
    try {
      let done = false;
      let guard = 0;
      while (!done && guard < 200) {
        guard += 1;
        const res = await base44.functions.invoke("syncBibleTranslation", { translation: translationId });
        const data = res.data || {};
        if (data.error) {
          setLog((p) => ({ ...p, [translationId]: `Erreur : ${data.error}` }));
          break;
        }
        done = data.status === "ready" || data.done === true;
        setLog((p) => ({
          ...p,
          [translationId]: `Livres traités : ${Math.min(data.booksProcessed ?? 0, 66)} / 66 · Versets importés : ${data.verseCount ?? 0}`,
        }));
        await load();
      }
    } catch (e) {
      setLog((p) => ({ ...p, [translationId]: `Erreur : ${e.message}` }));
    } finally {
      setRunning((p) => ({ ...p, [translationId]: false }));
      load();
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display font-extrabold text-xl">Recherche biblique — Synchronisation</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Indexe le texte des traductions pour la recherche plein texte (66 livres). La synchronisation
          malgache se fait par lots : cliquez à nouveau si le statut reste « partiel ».
        </p>
        {IS_POCKETBASE && (
          <p className="mt-2 text-xs text-foreground/60">
            Sur ce serveur, les versets sont importés par un script d'administration
            (pocketbase/scripts/importer-baiboly.mjs) : la synchronisation depuis l'app est désactivée.
          </p>
        )}
      </div>
      {TRANSLATIONS.map((t) => {
        const rec = records[t.id];
        const status = rec?.status || "not_configured";
        return (
          <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{t.name}</p>
                <p className="mt-0.5 text-xs text-foreground/60">
                  Statut : {status} · Versets importés : {rec?.verseCount || 0}
                </p>
              </div>
              <button
                onClick={() => runSync(t.id)}
                disabled={running[t.id] || IS_POCKETBASE}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {running[t.id] ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : status === "ready" ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {status === "ready" ? "Resynchroniser" : "Synchroniser"}
              </button>
            </div>
            {log[t.id] && (
              <p className="mt-2 flex items-center gap-2 text-xs text-foreground/70">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-primary" /> {log[t.id]}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}