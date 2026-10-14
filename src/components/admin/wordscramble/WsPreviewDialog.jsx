import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { wsLevelOf, wsCategoryLabel } from "@/lib/wordScrambleConstants";

// Aperçu administrateur : montre le mot, ses lettres mélangées et l'indice.
export default function WsPreviewDialog({ word, onClose }) {
  const lvl = word && wsLevelOf(word.difficulty);
  const scrambled = word ? word.word.split("").sort(() => Math.random() - 0.5) : [];
  return (
    <Dialog open={Boolean(word)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Aperçu du mot</DialogTitle></DialogHeader>
        {word && (
          <div className="space-y-3 text-center">
            <div className="flex flex-wrap justify-center gap-2">
              {scrambled.map((c, i) => (
                <span key={i} className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-border bg-card font-display font-extrabold text-xl">{c}</span>
              ))}
            </div>
            <p className="text-sm text-foreground/60">Solution : <b className="text-foreground">{word.word}</b> ({word.word.length} lettres)</p>
            <div className="flex justify-center gap-2 text-xs font-bold">
              {lvl && <span className={`rounded-full border px-2 py-0.5 ${lvl.badge}`}>{lvl.emoji} {lvl.label}</span>}
              <span className="rounded-full border border-border px-2 py-0.5">{wsCategoryLabel(word.category)}</span>
            </div>
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
              <p className="font-semibold">{word.hint_phrase}</p>
              {word.hint_bible_reference && <p className="mt-0.5 text-xs text-foreground/60">{word.hint_bible_reference}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}