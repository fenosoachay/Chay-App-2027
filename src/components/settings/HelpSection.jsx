import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { estNatif } from "@/lib/chayConversation";
import { APP_VERSION } from "@/lib/appVersion";
import { CheckCircle, ImagePlus, Loader2, Send, Wrench, X } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

// Aide et Assistance (1.3.22) : FAQ, puis un seul choix « Signaler au responsable un problème technique ».
// Le texte (et une capture d'écran facultative) part au responsable technique seulement (route signalerProbleme :
// notification + e-mail). Quand il clique « Réglé », le membre reçoit sa réponse dans ses messages, de la part
// de « Chay » (message automatique, sans réponse possible).
const MAX = 3000;

function FormulaireSignalement() {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");
  const [capture, setCapture] = useState(null); // File
  const [apercu, setApercu] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const fichierRef = useRef(null);

  useEffect(() => {
    if (!capture) { setApercu(""); return undefined; }
    const url = URL.createObjectURL(capture);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [capture]);

  const envoyer = async () => {
    if (!texte.trim()) { setErreur("Décrivez le problème en quelques mots."); return; }
    setEnvoi(true);
    setErreur("");
    try {
      const capture_url = capture ? await uploadToBase44(capture) : "";
      await base44.functions.invoke("signalerProbleme", {
        message: texte.trim(),
        capture_url,
        plateforme: `${estNatif() ? "Application Android" : "Site web"} · ${APP_VERSION}`,
      });
      setEnvoye(true);
      setTexte("");
      setCapture(null);
    } catch (e) {
      setErreur((typeof e?.data?.error === "string" && e.data.error) || "Envoi impossible. Vérifiez la connexion et réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  if (envoye) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
        <p className="flex items-start gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> Merci ! Le responsable technique a été prévenu.
        </p>
        <p className="mt-1 text-foreground/70">Quand ce sera réglé, vous recevrez sa réponse dans vos messages.</p>
        <button type="button" onClick={() => { setEnvoye(false); setOuvert(false); }} className="mt-2 text-xs font-semibold text-primary underline">
          Fermer
        </button>
      </div>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Wrench className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold">Signaler au responsable un problème technique</span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Wrench className="h-4 w-4 text-primary" /> Signaler au responsable un problème technique
      </p>
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value.slice(0, MAX))}
        rows={5}
        placeholder="Décrivez le problème : où (quelle page), quand, ce qui s'affiche…"
        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="text-right text-[0.7rem] text-foreground/40">{texte.length} / {MAX}</div>

      {apercu ? (
        <div className="relative inline-block">
          <img src={apercu} alt="Capture d'écran jointe" className="h-28 rounded-xl border border-border object-cover" />
          <button
            type="button"
            onClick={() => setCapture(null)}
            aria-label="Retirer la capture"
            className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-foreground text-background shadow"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fichierRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold"
        >
          <ImagePlus className="h-4 w-4" /> Ajouter une capture d'écran (facultatif)
        </button>
      )}
      <input
        ref={fichierRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setCapture(f); e.target.value = ""; }}
      />

      {erreur && <p role="alert" className="text-sm text-destructive">{erreur}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setOuvert(false); setErreur(""); }}
          disabled={envoi}
          className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={envoyer}
          disabled={envoi || !texte.trim()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full brand-gradient px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer
        </button>
      </div>
    </div>
  );
}

export default function HelpSection() {
  const [faqs, setFaqs] = useState([]);

  useEffect(() => {
    base44.entities.Faq
      .list("-order", 20)
      .then((r) => setFaqs(Array.isArray(r) ? r : []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/70">
        Besoin d'aide ? Nous sommes là pour vous accompagner.
      </p>

      {faqs.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-foreground/50 mb-1">
            FAQ
          </p>
          <Accordion type="single" collapsible defaultValue="">
            {faqs.map((f) => (
              <AccordionItem
                key={f.id}
                value={f.id}
                className="border border-border rounded-xl px-3 mb-2 bg-card"
              >
                <AccordionTrigger className="hover:no-underline text-sm font-semibold">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-foreground/70">
                  {f.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      <FormulaireSignalement />
    </div>
  );
}
