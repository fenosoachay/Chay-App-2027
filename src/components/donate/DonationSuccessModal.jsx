import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

// Modal de confirmation : fond semi-transparent, carte centrée, apparition douce.
export default function DonationSuccessModal() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm rounded-[2rem] border border-border bg-card p-8 text-center"
      >
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-green-500 text-white">
          <Check className="h-10 w-10" strokeWidth={3} />
        </div>
        <h2 className="font-display text-2xl font-extrabold">Merci !</h2>
        <p className="mt-3 text-foreground/70">
          L'église est notifiée de votre désir de donner, nous allons vous contacter sous peu.
        </p>
        <Link
          to="/"
          className="mt-7 block w-full rounded-full brand-gradient px-6 py-3.5 font-bold text-white transition hover:scale-[1.02]"
        >
          Retour à l'accueil
        </Link>
      </motion.div>
    </motion.div>
  );
}