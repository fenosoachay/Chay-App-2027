import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEPARTS, finAtteinte, oublis, traits } from "../data/ouVasTu.js";
import { normalizeLocalBooks, normalizeLocalChapter } from "./localBible.js";
import { analyserReference, textePassage } from "./versetsEnMasse.js";

const combinaisons = (d) => d.questions.reduce((acc, q) => acc.flatMap((c) => q.options.map((_, i) => [...c, i])), [[]]);

test("1.3.32 : Où vas-tu ? — 10 départs de 4 ou 5 choix, chaque fin atteignable, oublis expliqués", () => {
  assert.equal(DEPARTS.length, 10);
  assert.equal(new Set(DEPARTS.map((d) => d.id)).size, 10);
  for (const d of DEPARTS) {
    assert.ok(d.questions.length >= 4 && d.questions.length <= 5, d.id);
    const atteintes = new Set(combinaisons(d).map((c) => finAtteinte(d, c)));
    assert.equal(atteintes.size, d.fins.length, `${d.id} : fins atteintes ${[...atteintes].sort()}`);
    for (const q of d.questions) for (const o of q.options) {
      assert.ok(o.note, `${d.id} : note manquante`);
      for (const f of o.voit || []) assert.ok(d.facteurs[f], `${d.id} : facteur ${f}`);
    }
    const tout = combinaisons(d)[0];
    assert.ok(Array.isArray(oublis(d, tout)));
    assert.equal(traits(d, tout).inconnu, 0);
  }
});

test("chaque fin a un verset qui existe dans la Bible de l'app", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../../public/data/bibles/lsg1910_fr_CORRIGE.json", import.meta.url), "utf8"));
  const books = normalizeLocalBooks(raw);
  for (const d of DEPARTS) for (const f of d.fins) {
    const r = analyserReference(f.verset, books);
    assert.ok(r, `${d.id} : ${f.verset}`);
    assert.ok(textePassage(normalizeLocalChapter(raw, r.bookId, r.chapitre), r.debut, r.fin), `${d.id} : ${f.verset} vide`);
  }
});
