import React from "react";
import { WifiOff } from "lucide-react";

export default function QuizOfflineScreen() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-destructive/10">
        <WifiOff className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="font-display font-extrabold text-2xl">Connexion requise</h2>
      <p className="mt-2 text-foreground/60">Connexion requise pour jouer au Quiz biblique.</p>
    </div>
  );
}