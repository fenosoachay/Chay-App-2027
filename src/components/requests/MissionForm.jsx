import React, { useRef, useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { MISSION_VIDE, TYPES_MISSION, erreurMission } from "@/lib/missions";

const LIBELLES = {
  last_name: "Nom",
  first_name: "Prénom",
  age: "Âge",
  phone: "Numéro de téléphone",
  address: "Adresse",
};

const champCls = (enErreur) =>
  `w-full rounded-xl border bg-card px-3.5 py-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${
    enErreur ? "border-destructive" : "border-border"
  }`;

// Requêtes › « Se missionner » : identité (tout obligatoire), type de demande, précisions. Envoi : enregistrement
// visible dans le panneau admin et e-mail aux admins (route createMissionRequest).
export default function MissionForm() {
  const [f, setF] = useState(MISSION_VIDE);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoyee, setEnvoyee] = useState(false);
  const refs = useRef({});

  const set = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    if (erreur?.champ === k) setErreur(null);
  };

  const envoyer = async (e) => {
    e.preventDefault();
    const pb = erreurMission(f);
    if (pb) {
      setErreur(pb);
      refs.current[pb.champ]?.focus();
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await base44.functions.invoke("createMissionRequest", { ...f, age: Number(f.age) });
      setEnvoyee(true);
      setF(MISSION_VIDE);
    } catch (err) {
      setErreur({ champ: null, message: err?.message || "Envoi impossible. Réessayez." });
    } finally {
      setEnvoi(false);
    }
  };

  if (envoyee) {
    return (
      <div role="status" className="rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" aria-hidden="true" />
        <p className="font-display text-lg font-extrabold">Merci, votre demande est envoyée !</p>
        <p className="mt-1 text-sm text-foreground/70">L'équipe de l'église vous recontactera.</p>
        <button type="button" onClick={() => setEnvoyee(false)} className="mt-4 text-sm font-bold text-primary hover:underline">
          Faire une autre demande
        </button>
      </div>
    );
  }

  const champ = (k, props = {}) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold">{LIBELLES[k]} <span className="text-destructive" aria-hidden="true">*</span></span>
      <input
        ref={(el) => { refs.current[k] = el; }}
        value={f[k]}
        onChange={set(k)}
        required
        aria-invalid={erreur?.champ === k || undefined}
        className={champCls(erreur?.champ === k)}
        {...props}
      />
    </label>
  );

  return (
    <form onSubmit={envoyer} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {champ("last_name", { autoComplete: "family-name", maxLength: 100 })}
        {champ("first_name", { autoComplete: "given-name", maxLength: 100 })}
        {champ("age", { inputMode: "numeric", type: "number", min: 1, max: 120 })}
        {champ("phone", { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 30 })}
      </div>
      {champ("address", { autoComplete: "street-address", maxLength: 300 })}

      <label className="block">
        <span className="mb-1.5 block text-sm font-bold">Votre demande <span className="text-destructive" aria-hidden="true">*</span></span>
        <select
          ref={(el) => { refs.current.kind = el; }}
          value={f.kind}
          onChange={set("kind")}
          required
          aria-invalid={erreur?.champ === "kind" || undefined}
          className={champCls(erreur?.champ === "kind")}
        >
          <option value="">Choisir…</option>
          {TYPES_MISSION.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      {f.kind === "autre" && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">Précisez votre demande <span className="text-destructive" aria-hidden="true">*</span></span>
          <input
            ref={(el) => { refs.current.other_text = el; }}
            value={f.other_text}
            onChange={set("other_text")}
            maxLength={300}
            aria-invalid={erreur?.champ === "other_text" || undefined}
            className={champCls(erreur?.champ === "other_text")}
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-bold">Dites-nous un peu plus</span>
        <textarea
          value={f.details}
          onChange={set("details")}
          rows={4}
          maxLength={3000}
          placeholder="Votre motivation, vos disponibilités, votre projet…"
          className={champCls(false)}
        />
      </label>

      {erreur && <p role="alert" className="text-sm font-semibold text-destructive">{erreur.message}</p>}

      <button
        type="submit"
        disabled={envoi}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-bold text-primary-foreground shadow-sm transition hover:scale-[1.01] disabled:opacity-60"
      >
        {envoi ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        {envoi ? "Envoi…" : "Envoyer ma demande"}
      </button>
    </form>
  );
}
