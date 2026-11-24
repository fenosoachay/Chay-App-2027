import React, { useEffect, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { ADMIN_NAV, chercherNav, findNav } from "@/components/admin/nav/adminNavConfig";

const linkBase =
  "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors text-left border-l-4";
const linkIdle = "border-transparent text-foreground/70 hover:bg-primary/10";
const linkActive = "border-primary bg-primary/15 text-primary";

function Badge({ n }) {
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold text-white">{n}</span>;
}

/** Vrai si le groupe contient (à n'importe quelle profondeur) la page `key`. */
const contient = (entry, key) => (entry.items || []).some((i) => i.key === key || contient(i, key));

// Menu à accordéons sur plusieurs niveaux (Application › Contenu › Accueil › …) : à chaque niveau, une seule
// rubrique ouverte à la fois ; la branche de la page affichée s'ouvre d'elle-même.
export default function AdminSidebarNav({ active, onSelect, donationsUnread = 0 }) {
  const brancheActive = findNav(active).parents.map((g) => g.id);
  const cleBranche = brancheActive.join("/");
  const [ouverts, setOuverts] = useState(brancheActive);

  useEffect(() => {
    setOuverts(cleBranche ? cleBranche.split("/") : []);
  }, [cleBranche]);

  // Recherche : un seul résultat -> il s'affiche seul ; plusieurs -> liste de suggestions. Entrée ouvre le premier.
  const [recherche, setRecherche] = useState("");
  const resultats = recherche.trim() ? chercherNav(recherche) : null;
  const ouvrir = (key) => { setRecherche(""); onSelect(key); };

  const basculer = (id, profondeur) => {
    setOuverts((o) => (o[profondeur] === id ? o.slice(0, profondeur) : [...o.slice(0, profondeur), id]));
  };

  const champ = (
    <div className="relative mb-2">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
      <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resultats?.length) { e.preventDefault(); ouvrir(resultats[0].item.key); }
          if (e.key === "Escape") setRecherche("");
        }}
        placeholder="Rechercher (Article, Foi…)"
        aria-label="Rechercher dans l'administration"
        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-9 text-sm font-semibold outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
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
  );

  if (resultats) {
    return (
      <nav className="space-y-1" aria-label="Navigation administration">
        {champ}
        {!resultats.length && <p className="px-3 py-2 text-sm text-foreground/50">Aucune page trouvée.</p>}
        {resultats.length > 1 && (
          <p className="px-3 pb-1 text-xs font-semibold text-foreground/50">{resultats.length} suggestions</p>
        )}
        {resultats.map(({ item, groupe }) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => ouvrir(item.key)}
              className={`${linkBase} ${active === item.key ? linkActive : linkIdle}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {groupe && <span className="block truncate text-xs font-semibold text-foreground/50">{groupe}</span>}
              </span>
              {item.key === "donations" && <Badge n={donationsUnread} />}
            </button>
          );
        })}
      </nav>
    );
  }

  const rendre = (entries, profondeur, visible) =>
    entries.map((entry) => {
      const Icon = entry.icon;
      if (!entry.items) {
        return (
          <button
            key={entry.key}
            tabIndex={visible ? 0 : -1}
            onClick={() => onSelect(entry.key)}
            className={`${linkBase} ${profondeur ? "gap-2 px-2 py-2 font-semibold" : ""} ${active === entry.key ? linkActive : linkIdle}`}
          >
            <Icon className="h-4 w-4 shrink-0" /> <span className="min-w-0 leading-tight">{entry.label}</span>
            {entry.key === "donations" && <Badge n={donationsUnread} />}
          </button>
        );
      }
      const open = ouverts[profondeur] === entry.id;
      const dansBranche = contient(entry, active);
      const groupBadge = contient(entry, "donations") ? donationsUnread : 0;
      const partie = profondeur === 0; // Application, Site chay.fr, Équipe
      return (
        <div key={entry.id} className={partie ? "rounded-2xl" : ""}>
          <button
            tabIndex={visible ? 0 : -1}
            onClick={() => basculer(entry.id, profondeur)}
            aria-expanded={open}
            className={`${linkBase} ${partie ? "py-3 text-base uppercase tracking-wide" : profondeur > 1 ? "gap-2 px-2 py-2 font-semibold" : "gap-2 px-2"} ${
              dansBranche ? "border-transparent text-primary" : linkIdle
            } hover:bg-primary/10`}
          >
            <Icon className={`${partie ? "h-5 w-5" : "h-4 w-4"} shrink-0`} />
            <span className="min-w-0 leading-tight">{entry.label}</span>
            {!open && <Badge n={groupBadge} />}
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""} ${!open && groupBadge ? "" : "ml-auto"}`}
            />
          </button>
          <div
            className={`grid transition-all duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          >
            <div className="overflow-hidden">
              <div className={`${partie ? "ml-3" : "ml-2.5"} mt-1 space-y-0.5 border-l border-border pl-1.5`}>
                {rendre(entry.items, profondeur + 1, visible && open)}
              </div>
            </div>
          </div>
        </div>
      );
    });

  return (
    <nav className="space-y-1" aria-label="Navigation administration">
      {champ}
      {rendre(ADMIN_NAV, 0, true)}
    </nav>
  );
}
