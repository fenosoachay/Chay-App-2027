import React, { useState } from "react";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { openExternal } from "@/lib/openExternal";
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

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function openExternalUrl(href) {
  openExternal(href);
}

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
    setTimeout(() => openExternalUrl(href), 50);
  };

  const handleClick = (e) => {
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
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