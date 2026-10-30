import React, { useState } from "react";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Extrait le nom de domaine d'une URL pour l'afficher dans le dialogue.
 */
function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Lien externe avec confirmation en français.
 * Remplace le dialogue natif Android qui s'affiche en anglais.
 */
export default function ExternalLink({
  href,
  label,
  children,
  className,
  showIcon = false,
  ...props
}) {
  const [open, setOpen] = useState(false);
  const domain = getDomain(href);

  const handleConfirm = () => {
    setOpen(false);
    // Ouvre dans le navigateur — on utilise window.open au lieu du comportement
    // natif du <a target="_blank"> pour éviter le dialogue système en anglais.
    setTimeout(() => {
      window.open(href, "_blank", "noopener,noreferrer");
    }, 50);
  };

  const handleClick = (e) => {
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      {/* Le <a> est toujours là pour l'accessibilité (copier le lien, etc.) */}
      <a
        href={href}
        onClick={handleClick}
        aria-label={label}
        className={className}
        {...props}
      >
        {children}
        {showIcon && <ExternalLinkIcon className="h-3.5 w-3.5 ml-1 inline opacity-70" />}
      </a>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold">
              Ouvrir un lien externe ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Voulez-vous ouvrir <span className="font-semibold text-foreground">{domain}</span> dans votre navigateur ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:space-x-2">
            <AlertDialogCancel className="mt-0 text-sm font-semibold">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="brand-gradient text-white border-0 hover:opacity-90 text-sm font-semibold"
            >
              Ouvrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
