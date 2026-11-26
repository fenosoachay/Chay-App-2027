import React, { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Globe, Loader2, Mail, Reply, Smartphone, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { confirmFr } from "@/lib/confirmFr";
import { lienReponse } from "@/lib/messagesSite";

// Admin › Messages (1.3.42) : messages reçus par le formulaire « Nous contacter » (site chay.fr ou appli).
// Avant, la liste ne permettait rien. Maintenant : lire le message en entier, répondre par e-mail (le message
// d'origine est repris), copier l'adresse, supprimer (les messages ne sont gardés que 3 ans au plus).
export default function MessagesSite() {
  const { toast } = useToast();
  const [messages, setMessages] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [copie, setCopie] = useState(null);

  const charger = useCallback(() => {
    base44.entities.ContactMessage.list("-created_date", 300)
      .then((r) => setMessages(Array.isArray(r) ? r : []))
      .catch(() => setMessages([]));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const copier = async (m) => {
    try {
      await navigator.clipboard.writeText(m.email);
      setCopie(m.id);
      setTimeout(() => setCopie(null), 1800);
    } catch {
      toast({ title: "Copie impossible", description: m.email });
    }
  };

  const supprimer = async (m) => {
    if (!(await confirmFr({ title: "Supprimer ce message ?", message: `Message de ${m.name || "inconnu"}. Il ne pourra pas être récupéré.`, confirmLabel: "Supprimer" }))) return;
    try {
      await base44.entities.ContactMessage.delete(m.id);
      setMessages((l) => l.filter((x) => x.id !== m.id));
      toast({ title: "Message supprimé" });
    } catch (e) {
      toast({ title: "Suppression impossible", description: e?.message, variant: "destructive" });
    }
  };

  if (!messages) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-foreground/50" /></div>;
  if (!messages.length) return <p className="py-8 text-center text-sm text-foreground/55">Aucun message pour le moment.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/60">
        {messages.length} message{messages.length > 1 ? "s" : ""}. Touchez un message pour le lire en entier et y répondre.
      </p>
      {messages.map((m) => {
        const plein = ouvert === m.id;
        const date = new Date(m.created_date || m.created || Date.now());
        const SourceIcone = m.source === "site" ? Globe : Smartphone;
        return (
          <article key={m.id} className={`rounded-2xl border bg-card transition ${plein ? "border-primary/50 shadow-md" : "border-border"}`}>
            <button
              type="button"
              onClick={() => setOuvert(plein ? null : m.id)}
              aria-expanded={plein}
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 font-bold text-primary">
                {(m.name || "?").trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold">{m.name || "Sans nom"}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-foreground/60">
                    <SourceIcone className="h-3 w-3" /> {m.source === "site" ? "Site" : "Appli"}
                  </span>
                </span>
                <span className="block truncate text-sm font-semibold text-foreground/80">{m.subject || "Sans sujet"}</span>
                {!plein && <span className="mt-0.5 block line-clamp-2 text-sm text-foreground/55">{m.message}</span>}
                <span className="mt-1 block text-xs text-foreground/45">
                  {date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <ChevronDown className={`mt-2 h-4 w-4 shrink-0 text-foreground/40 transition-transform ${plein ? "rotate-180" : ""}`} />
            </button>
            {plein && (
              <div className="border-t border-border px-4 pb-4 pt-3">
                <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Mail className="h-4 w-4" /> {m.email}
                </a>
                <p className="mt-3 whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{m.message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={lienReponse(m)}
                    className="inline-flex items-center gap-2 rounded-full brand-gradient px-4 py-2 text-sm font-bold text-white shadow"
                  >
                    <Reply className="h-4 w-4" /> Répondre par e-mail
                  </a>
                  <button type="button" onClick={() => copier(m)} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                    {copie === m.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    {copie === m.id ? "Adresse copiée" : "Copier l'adresse"}
                  </button>
                  <button type="button" onClick={() => supprimer(m)} className="inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400">
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
