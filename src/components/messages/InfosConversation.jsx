import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ExternalLink, Image as ImageIcon, Link2, Search, UserRound, Users, X } from "lucide-react";
import GroupeMembres, { EnteteGroupe } from "@/components/messages/GroupeMembres";
import { useBackHandler } from "@/hooks/useBackHandler";
import { confirmFr } from "@/lib/confirmFr";
import { openExternal } from "@/lib/openExternal";

// Bouton « i » d'une conversation (façon Messenger) : profil de la personne, recherche dans la conversation,
// photos échangées, liens échangés. Plein écran, au-dessus de la conversation ; retour = conversation.
// Groupe (1.3.27) : `groupe` = { conversation, user, profiles, peutGerer, onUpdated } : nom et photo du groupe,
// onglet « Membres » (liste pour tous ; ajout et retrait par l'admin du groupe).
const LIEN = /((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const simplifier = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dateCourte = (d) => {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};

export default function InfosConversation({ titre, avatar, autreId, messages, nomDe, onFermer, onAllerAuMessage, onVoirPhoto, groupe = null }) {
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState(groupe ? "membres" : "photos");
  const [recherche, setRecherche] = useState("");
  useBackHandler(true, onFermer);

  const photos = useMemo(() => messages.filter((m) => m.image_url), [messages]);
  const liens = useMemo(() => messages.flatMap((m) =>
    (String(m.text || "").match(LIEN) || []).map((l, i) => {
      const propre = l.replace(/[.,;:!?)»\]]+$/, "");
      return { cle: `${m.id}-${i}`, url: /^https?:\/\//i.test(propre) ? propre : `https://${propre}`, texte: propre, m };
    })).reverse(), [messages]);
  const resultats = useMemo(() => {
    const mots = simplifier(recherche).trim().split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return messages.filter((m) => m.text && mots.every((w) => simplifier(m.text).includes(w))).reverse();
  }, [messages, recherche]);

  const ouvrirLien = async (url) => {
    if (await confirmFr({ title: "Ouvrir ce lien dans le navigateur ?", message: url, confirmLabel: "Ouvrir" })) {
      openExternal(url).catch(() => {});
    }
  };

  const Onglet = ({ id, label, Icone, n }) => (
    <button
      type="button"
      onClick={() => setOnglet(id)}
      className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-2 text-sm font-bold transition ${onglet === id ? "bg-primary text-primary-foreground" : "text-foreground/70"}`}
    >
      <Icone className="h-4 w-4" /> {label}{n ? ` (${n})` : ""}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background" style={{ paddingTop: "var(--sa-top)", paddingBottom: "var(--sa-bottom)" }}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button type="button" onClick={onFermer} aria-label="Retour" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-display text-lg font-bold">Infos</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groupe ? (
          <EnteteGroupe conversation={groupe.conversation} peutGerer={groupe.peutGerer} onUpdated={groupe.onUpdated} />
        ) : (
        /* Personne */
        <div className="flex flex-col items-center gap-2 px-4 pb-4 pt-6 text-center">
          {avatar ? (
            <img src={avatar} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-full brand-gradient text-3xl font-bold text-white">
              {String(titre || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="max-w-full truncate font-display text-xl font-extrabold">{titre}</div>
          {autreId && (
            <button
              type="button"
              onClick={() => { onFermer(); navigate(`/profile/${autreId}`); }}
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
            >
              <UserRound className="h-4 w-4" /> Voir le profil
            </button>
          )}
        </div>
        )}

        {/* Recherche dans la conversation */}
        <div className="px-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher dans la conversation"
              aria-label="Rechercher dans la conversation"
              className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
            />
            {recherche && (
              <button type="button" onClick={() => setRecherche("")} aria-label="Effacer" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-foreground/50 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {recherche.trim() ? (
          <div className="px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-foreground/50">
              {resultats.length ? `${resultats.length} message${resultats.length > 1 ? "s" : ""}` : "Aucun message trouvé."}
            </p>
            <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
              {resultats.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onFermer(); onAllerAuMessage(m.id); }}
                  className="block w-full bg-card px-3 py-2.5 text-left hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-foreground/50">
                    <span className="truncate font-semibold">{nomDe(m)}</span>
                    <span className="shrink-0">{dateCourte(m.created_date)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-sm">{m.text}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="mb-3 flex gap-1 rounded-full border border-border bg-card p-1">
              {groupe && <Onglet id="membres" label="Membres" Icone={Users} n={(groupe.conversation?.participant_ids || []).length} />}
              <Onglet id="photos" label="Photos" Icone={ImageIcon} n={photos.length} />
              <Onglet id="liens" label="Liens" Icone={Link2} n={liens.length} />
            </div>

            {onglet === "membres" && groupe && (
              <GroupeMembres
                conversation={groupe.conversation}
                user={groupe.user}
                profiles={groupe.profiles}
                peutGerer={groupe.peutGerer}
                onUpdated={groupe.onUpdated}
              />
            )}

            {onglet === "photos" && (
              photos.length ? (
                <div className="grid grid-cols-3 gap-1">
                  {photos.slice().reverse().map((m) => (
                    <button key={m.id} type="button" onClick={() => onVoirPhoto(m)} className="aspect-square overflow-hidden rounded-[6px] bg-muted">
                      <img src={m.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : <p className="py-8 text-center text-sm text-foreground/50">Aucune photo échangée.</p>
            )}

            {onglet === "liens" && (
              liens.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
                  {liens.map((l) => (
                    <button key={l.cle} type="button" onClick={() => ouvrirLien(l.url)} className="flex w-full items-center gap-3 bg-card px-3 py-2.5 text-left hover:bg-muted">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-primary/10 text-primary"><Link2 className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-primary">{l.texte}</span>
                        <span className="block truncate text-xs text-foreground/50">{nomDe(l.m)} · {dateCourte(l.m.created_date)}</span>
                      </span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-foreground/40" />
                    </button>
                  ))}
                </div>
              ) : <p className="py-8 text-center text-sm text-foreground/50">Aucun lien échangé.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
