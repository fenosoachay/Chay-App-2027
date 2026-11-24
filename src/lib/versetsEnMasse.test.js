import test from "node:test";
import assert from "node:assert/strict";
import { MAX_VERSETS, analyserReference, joursLibres, lireLignes, textePassage } from "./versetsEnMasse.js";

const books = [
  { id: "JHN", name: "Jean" }, { id: "1JN", name: "1 Jean" }, { id: "PSA", name: "Psaumes" },
  { id: "PHP", name: "Philippiens" }, { id: "ROM", name: "Romains" },
];

test("versets en masse : lignes nettoyées, 50 au plus", () => {
  assert.deepEqual(lireLignes("1. Jean 3:16\n\n- Romains 8:28.\n  Psaume 23:1 ").lignes, ["Jean 3:16", "Romains 8:28", "Psaume 23:1"]);
  const r = lireLignes(Array.from({ length: 55 }, (_, i) => `Jean 3:${i + 1}`).join("\n"));
  assert.equal(r.lignes.length, MAX_VERSETS);
  assert.equal(r.enTrop, 5);
});

test("versets en masse : références lues (livre, chapitre, versets)", () => {
  assert.deepEqual(analyserReference("Jean 3:16", books), { bookId: "JHN", livre: "Jean", chapitre: 3, debut: 16, fin: 16, ref: "Jean 3:16" });
  assert.equal(analyserReference("jean 3.16", books).ref, "Jean 3:16");
  assert.equal(analyserReference("1 Jean 4:7-8", books).ref, "1 Jean 4:7-8");
  assert.equal(analyserReference("1er Jean 4:7–8", books).ref, "1 Jean 4:7-8");
  assert.equal(analyserReference("Psaume 23:1-3", books).ref, "Psaumes 23:1-3");
  assert.equal(analyserReference("Philippiens 4 : 13", books).ref, "Philippiens 4:13");
  assert.equal(analyserReference("Jean 3", books), null); // verset manquant
  assert.equal(analyserReference("Livre inconnu 3:16", books), null);
});

test("versets en masse : jours à la suite, jours déjà programmés sautés", () => {
  assert.deepEqual(joursLibres("2026-12-30", 3), ["2026-12-30", "2026-12-31", "2027-01-01"]);
  assert.deepEqual(joursLibres("2026-12-01", 3, new Set(["2026-12-02"])), ["2026-12-01", "2026-12-03", "2026-12-04"]);
  assert.deepEqual(joursLibres("pas une date", 3), []);
});

test("versets en masse : texte d'un passage", () => {
  const ch = [{ number: 1, text: "A " }, { number: 2, text: "B" }, { number: 3, text: "C" }];
  assert.equal(textePassage(ch, 1, 2), "A B");
  assert.equal(textePassage(ch, 9, 9), "");
});
