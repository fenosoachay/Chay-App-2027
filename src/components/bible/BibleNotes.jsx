import React, { useState } from "react";
import {
  ChevronLeft,
  Highlighter,
  StickyNote,
  BookMarked,
  Search as SearchIcon,
} from "lucide-react";
import useAllAnnotations from "@/hooks/useAllAnnotations";
import HighlightsTab from "./notes/HighlightsTab";
import PersonalNotesTab from "./notes/PersonalNotesTab";
import DictionaryTab from "./notes/DictionaryTab";
import ConcordanceTab from "./notes/ConcordanceTab";

const TABS = [
  { id: "highlights", label: "Surlignés", icon: Highlighter },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "dictionary", label: "Dictionnaire", icon: BookMarked },
  { id: "concordance", label: "Concordance", icon: SearchIcon },
];

export default function BibleNotes({ onBack }) {
  const [tab, setTab] = useState("highlights");
  const api = useAllAnnotations();

  return (
    <main className="mx-auto max-w-5xl px-4 py-4 md:px-8 md:py-10">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-primary hover:bg-primary/10"
        >
          <ChevronLeft className="h-5 w-5" /> Retour
        </button>
      </div>

      <header className="mb-5 flex items-center gap-2.5">
        <div className="rounded-xl bg-primary/10 p-2">
          <StickyNote className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            Mes notes
          </h1>
          <p className="text-xs text-muted-foreground">
            Vos surlignages, notes et favoris
          </p>
        </div>
      </header>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1 no-scrollbar">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-w-max flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                active
                  ? "brand-gradient text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tab === "highlights" && <HighlightsTab api={api} />}
        {tab === "notes" && <PersonalNotesTab api={api} />}
        {tab === "dictionary" && <DictionaryTab />}
        {tab === "concordance" && <ConcordanceTab />}
      </div>
    </main>
  );
}