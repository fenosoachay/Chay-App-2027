import React from "react";
import { confirmFr } from "@/lib/confirmFr";
import { openExternal } from "@/lib/openExternal";

// Texte d'un message : les liens (http://, https://, www.) deviennent cliquables ; au toucher, on demande
// d'abord « Ouvrir ce lien dans le navigateur ? », puis le lien s'ouvre dans le navigateur du téléphone.
const LIEN = /((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
// Ponctuation collée à la fin d'un lien dans une phrase (« voir https://x.fr. ») : pas dans le lien.
const FIN = /[.,;:!?)»\]]+$/;

export default function TexteAvecLiens({ texte, clair = false }) {
  const morceaux = String(texte || "").split(LIEN);
  return morceaux.map((m, i) => {
    if (i % 2 === 0) return <React.Fragment key={i}>{m}</React.Fragment>;
    const fin = (m.match(FIN) || [""])[0];
    const lien = fin ? m.slice(0, -fin.length) : m;
    const url = /^https?:\/\//i.test(lien) ? lien : `https://${lien}`;
    return (
      <React.Fragment key={i}>
        <a
          href={url}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ok = await confirmFr({
              title: "Ouvrir ce lien dans le navigateur ?",
              message: url,
              confirmLabel: "Ouvrir",
            });
            if (ok) openExternal(url).catch(() => {});
          }}
          className={`underline underline-offset-2 break-all ${clair ? "text-white" : "text-primary"}`}
        >
          {lien}
        </a>
        {fin}
      </React.Fragment>
    );
  });
}
