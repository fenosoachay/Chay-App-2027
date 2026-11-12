import React, { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useNetwork } from "@/lib/NetworkContext";
import DonationSuccessModal from "@/components/donate/DonationSuccessModal";
import DonationGuestPrompt from "@/components/donate/DonationGuestPrompt";

export default function Donate() {
  const { isAuthenticated } = useAuth();
  const { isOnline } = useNetwork();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const notify = async () => {
    setSending(true);
    setError("");
    setPending(false);
    try {
      const res = await base44.functions.invoke("createDonationRequest", {});
      if (res.data?.already_pending) setPending(true);
      else setDone(true);
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-10 md:py-16">
      <h1 className="text-center text-2xl font-bold">Soutenir l'Église Chay</h1>
      <p className="mt-4 text-center text-base text-foreground/60">
        Votre générosité permet de soutenir l'œuvre de Dieu et la diffusion de l'Évangile. Misaotra betsaka !
      </p>
      <p className="mt-3 text-center text-sm italic">
        Merci de notifier l'église en cliquant ci-dessous.
      </p>

      <div className="mt-8 space-y-4">
        {!isAuthenticated && isOnline ? (
          <DonationGuestPrompt />
        ) : (
          <button
            onClick={notify}
            disabled={sending || !isOnline}
            className="flex w-full items-center justify-center gap-2 rounded-full brand-gradient px-6 py-4 text-base font-bold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Notifier mon intention de donner
          </button>
        )}

        {!isOnline && (
          <p role="status" className="text-center text-sm text-foreground/60">
            Connexion requise pour notifier l'église. Réessayez quand vous serez en ligne.
          </p>
        )}
        {pending && (
          <p role="status" className="text-center text-sm text-foreground/80">
            Votre demande précédente est encore en attente. L'église vous contactera bientôt.
          </p>
        )}
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
      </div>

      {done && <DonationSuccessModal />}
    </div>
  );
}