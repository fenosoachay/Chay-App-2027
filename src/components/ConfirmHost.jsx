import React, { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { registerConfirmHost } from "@/lib/confirmFr";

// Affiche les confirmations demandées via confirmFr(), toujours en français.
export default function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => registerConfirmHost(setReq), []);

  const close = (value) => {
    req?.resolve(value);
    setReq(null);
  };

  return (
    <AlertDialog open={!!req} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title || "Confirmation"}</AlertDialogTitle>
          <AlertDialogDescription>{req?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{req?.cancelLabel || "Annuler"}</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)}>{req?.confirmLabel || "Confirmer"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}