import React from "react";
import { Link } from "react-router-dom";

const RETURN = encodeURIComponent("/donate");

// Invité : invitation à se connecter ou créer un compte, avec retour automatique à la page don.
export default function DonationGuestPrompt() {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm text-foreground/80">
        Pour notifier l'église, veuillez vous connecter ou créer un compte.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Link
          to={`/login?returnTo=${RETURN}`}
          className="rounded-full brand-gradient px-4 py-3 text-sm font-bold text-white transition hover:scale-[1.02]"
        >
          Se connecter
        </Link>
        <Link
          to={`/register?returnTo=${RETURN}`}
          className="rounded-full brand-gradient px-4 py-3 text-sm font-bold text-white transition hover:scale-[1.02]"
        >
          Créer un compte
        </Link>
      </div>
    </div>
  );
}