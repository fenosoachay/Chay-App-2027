import React, { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2, Rocket } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { fetchLatest } from "@/lib/apkRelease";
import { confirmFr } from "@/lib/confirmFr";
import { messageConfirmationVersion } from "@/lib/annonceVersion";

// Panneau admin › Équipe › « Annoncer une mise à jour » : après la publication d'un nouvel APK, e-mail à tous les
// membres et notification push aux appareils. Aperçu puis confirmation « Envoyer à N membres ? » ; le serveur
// refuse une seconde annonce de la même version (code de version).
export default function AnnoncerVersion() {
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resultat, setResultat] = useState(null);

  // Pré-remplissage : dernière version publiée (latest.json) ; modifiable.
  useEffect(() => {
    let actif = true;
    fetchLatest().then((l) => {
      if (!actif || !l) return;
      setVersionName((v) => v || l.versionName);
      setVersionCode((v) => v || String(l.versionCode));
    });
    return () => { actif = false; };
  }, []);

  const appeler = (extra = {}) => base44.functions
    .invoke("annoncerVersion", { version_name: versionName.trim(), version_code: Number(versionCode), ...extra })
    .then((r) => r.data);

  const annoncer = async (e) => {
    e.preventDefault();
    setErreur("");
    setResultat(null);
    setOccupe(true);
    try {
      let apercu = await appeler();
      if (apercu.deja) {
        setErreur(`La version ${apercu.version_name} a déjà été annoncée : aucun envoi.`);
        return;
      }
      // Confirmation ; si la liste change entre l'aperçu et l'envoi, le serveur refuse et on redemande.
      for (let essai = 0; essai < 2; essai++) {
        const ok = await confirmFr({
          title: "Annoncer la mise à jour ?",
          message: messageConfirmationVersion(apercu),
          confirmLabel: `Envoyer à ${apercu.destinataires} membre${apercu.destinataires > 1 ? "s" : ""}`,
        });
        if (!ok) return;
        try {
          setResultat(await appeler({ confirmer: true, attendu: apercu.destinataires }));
          return;
        } catch (err) {
          const d = err?.data || {};
          if (err?.status === 409 && Number.isInteger(d.destinataires) && essai === 0) {
            apercu = { ...apercu, destinataires: d.destinataires, appareils: d.appareils ?? apercu.appareils };
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      setErreur(err?.message || "Annonce impossible.");
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="mb-2 flex items-center gap-2">
        <Rocket className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="font-display text-xl font-extrabold">Annoncer une mise à jour</h2>
      </div>
      <p className="mb-5 text-sm text-foreground/60">
        À faire après la publication du nouvel APK. Chaque membre reçoit un e-mail et une notification sur ses
        appareils (sauf s'il a coupé « Nouvelle version » dans ses réglages). Une version n'est annoncée qu'une fois.
      </p>
      <form onSubmit={annoncer} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Version (ex. 1.3.7)</span>
            <input value={versionName} onChange={(e) => setVersionName(e.target.value)} required inputMode="decimal" className="w-full rounded-xl border border-input bg-background px-3 py-2.5" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Code de version (ex. 11)</span>
            <input value={versionCode} onChange={(e) => setVersionCode(e.target.value.replace(/[^0-9]/g, ""))} required inputMode="numeric" className="w-full rounded-xl border border-input bg-background px-3 py-2.5" />
          </label>
        </div>
        {erreur && <p role="alert" className="text-sm font-semibold text-destructive">{erreur}</p>}
        <button
          type="submit"
          disabled={occupe || !versionName.trim() || !versionCode}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-50"
        >
          {occupe ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
          Préparer l'annonce
        </button>
      </form>
      {resultat && (
        <div role="status" className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Version {resultat.version_name} annoncée</div>
          <p>E-mails : {resultat.emails_envoyes} envoyé(s), {resultat.emails_restants} en file (envoi automatique, par lots, chaque minute).</p>
          <p>Notifications push : {resultat.push ? `${resultat.push.pushSent} envoyée(s)${resultat.push.pushFailed ? `, ${resultat.push.pushFailed} en échec (nouvel essai automatique)` : ""}` : "aucune"}.</p>
        </div>
      )}
    </section>
  );
}
