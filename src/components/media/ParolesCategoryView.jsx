import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Cross, Loader2, Music, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ParolesCard from "./ParolesCard";

const sansAccents = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
/** Lettre de rangement d'un titre (A à Z, sinon « # » : chiffres, symboles). */
const lettreDe = (titre) => {
  const l = sansAccents(titre).trim().charAt(0).toUpperCase();
  return LETTRES.includes(l) ? l : "#";
};

/** Bannière dessinée : lever de soleil doré sur un champ et croix (clair) ; montagnes violettes (sombre). */
function Banniere({ titre, onBack, onRecherche }) {
  return (
    <div className="relative mb-4 h-36 overflow-hidden rounded-[1.5rem] text-[#3b2410] dark:text-white">
      {/* Clair : ciel, soleil, champ de blé */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#fbf3e6] via-[#f6dfb5] to-[#d9a95a] dark:hidden" />
      <div className="absolute left-1/2 top-[58%] h-28 w-28 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#fff7d6_0%,#ffe29a_35%,transparent_70%)] dark:hidden" />
      <svg className="absolute inset-x-0 bottom-0 h-14 w-full dark:hidden" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 26 Q100 14 200 22 T400 18 V60 H0Z" fill="#e2b46a" />
        <path d="M0 38 Q120 28 220 36 T400 32 V60 H0Z" fill="#c8913f" />
        <path d="M0 50 Q140 42 260 48 T400 46 V60 H0Z" fill="#a8732c" />
      </svg>
      <Cross className="absolute left-[64%] top-7 h-20 w-20 text-[#7a4a1c] opacity-80 dark:hidden" strokeWidth={1.6} aria-hidden="true" />
      {/* Sombre : crépuscule violet et montagnes */}
      <div className="absolute inset-0 hidden bg-gradient-to-b from-[#2d1f57] via-[#5a3d8f] to-[#c07aa8] dark:block" />
      <div className="absolute left-[62%] top-[55%] hidden h-24 w-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#ffd6a8_0%,#f3a2b8_35%,transparent_70%)] dark:block" />
      <svg className="absolute inset-x-0 bottom-0 hidden h-20 w-full dark:block" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 50 L60 22 L110 44 L170 12 L230 46 L290 20 L350 42 L400 28 V80 H0Z" fill="#4a3478" opacity="0.85" />
        <path d="M0 64 L80 40 L150 60 L220 34 L300 62 L360 44 L400 56 V80 H0Z" fill="#2f2154" />
      </svg>

      <div className="relative flex h-full items-start justify-between p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/50 backdrop-blur hover:bg-white/70 dark:bg-white/15 dark:hover:bg-white/25"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="flex items-center gap-2 font-display text-3xl font-extrabold">
            <Music className="h-7 w-7" aria-hidden="true" /> {titre}
          </h2>
        </div>
        <button
          type="button"
          onClick={onRecherche}
          aria-label="Rechercher un titre"
          className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/40 dark:hover:bg-white/15"
        >
          <Search className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

// Section « Paroles » : paroles des chansons chantées à l'Église, groupées par lettre (ordre alphabétique),
// recherche par titre, alphabet à droite pour aller directement à une lettre.
export default function ParolesCategoryView({ titre = "Paroles", onBack }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState(null);
  const [recherche, setRecherche] = useState("");
  const champRef = useRef(null);
  const sectionsRef = useRef({});

  useEffect(() => {
    let actif = true;
    base44.entities.Paroles.list("-created_date", 500)
      .then((rows) => { if (actif) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (actif) setItems([]); });
    return () => { actif = false; };
  }, []);

  const groupes = useMemo(() => {
    const terme = sansAccents(recherche).toLowerCase().trim();
    const tries = [...(items || [])]
      .filter((t) => !terme || sansAccents(t.title).toLowerCase().includes(terme))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base", numeric: true }));
    const m = new Map();
    for (const t of tries) {
      const l = lettreDe(t.title);
      if (!m.has(l)) m.set(l, []);
      m.get(l).push(t);
    }
    // « # » (titres commençant par un chiffre ou un symbole) en premier, puis A à Z.
    return [...m.entries()].sort(([a], [b]) => (a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b)));
  }, [items, recherche]);

  const presentes = new Set(groupes.map(([l]) => l));
  const allerA = (l) => sectionsRef.current[l]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div>
      <Banniere titre={titre} onBack={onBack} onRecherche={() => champRef.current?.focus()} />

      <p className="mb-3 text-foreground/70">
        Vous trouverez ici les paroles de toutes les chansons chantées à l'Église. Bonne lecture !
      </p>

      <label className="mb-5 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-foreground/40" aria-hidden="true" />
        <input
          ref={champRef}
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un titre…"
          aria-label="Rechercher un titre"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>

      {items === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : !items.length ? (
        <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
          <p className="font-semibold">Aucune parole pour le moment.</p>
          {isAdmin && <p className="mt-1 text-sm text-foreground/60">Ajoutez la première depuis l'admin.</p>}
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 space-y-4">
            {groupes.length === 0 && (
              <p className="py-8 text-center text-foreground/50">Aucun titre ne correspond à votre recherche.</p>
            )}
            {groupes.map(([lettre, liste]) => (
              <section
                key={lettre}
                ref={(el) => { sectionsRef.current[lettre] = el; }}
                className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card/80 dark:bg-white/5 dark:backdrop-blur"
              >
                <div className="bg-[#f3e4cc] px-3 py-1.5 dark:bg-white/10">
                  <span className="inline-grid h-7 min-w-7 place-items-center rounded-lg bg-[#b8732e] px-2 font-display text-sm font-extrabold text-white dark:bg-[#d9b8ee] dark:text-[#2d1f57]">
                    {lettre}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {liste.map((t) => (
                    <ParolesCard key={t.id} texte={t} variante="ligne" />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Alphabet : aller directement à une lettre (lettres sans chanson grisées). */}
          <nav aria-label="Aller à une lettre" className="sticky top-24 flex h-fit w-6 shrink-0 flex-col items-center gap-0.5 rounded-full bg-card/70 py-2 text-[0.7rem] font-bold dark:bg-white/5">
            {LETTRES.map((l) => (
              <button
                key={l}
                type="button"
                disabled={!presentes.has(l)}
                onClick={() => allerA(l)}
                aria-label={`Lettre ${l}`}
                className="w-full leading-[1.35] text-[#b8732e] disabled:text-foreground/25 dark:text-[#d9b8ee] dark:disabled:text-white/25"
              >
                {l}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
