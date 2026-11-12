import test from "node:test";
import assert from "node:assert/strict";
import { appliquerOrdre, deplacer } from "./glisserOrdre.js";

const l = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (x) => x.map((e) => e.id).join("");

test("deplacer : haut, bas, bornes, sans modifier l'original", () => {
  assert.equal(ids(deplacer(l, 3, 0)), "dabc");
  assert.equal(ids(deplacer(l, 0, 2)), "bcad");
  assert.equal(ids(deplacer(l, 1, 99)), "acdb");
  assert.equal(ids(deplacer(l, 1, -5)), "bacd");
  assert.equal(ids(deplacer(l, 9, 0)), "abcd");
  assert.equal(ids(l), "abcd");
});

test("comme onDragEnd de @hello-pangea/dnd : source.index -> destination.index", () => {
  const result = { source: { index: 0 }, destination: { index: 2 } };
  assert.equal(ids(deplacer(l, result.source.index, result.destination.index)), "bcad");
});

test("appliquerOrdre", () => {
  const r = appliquerOrdre([...l, { id: "z", order: 7 }], [l[2], l[0]], "order");
  assert.deepEqual(r.map((e) => e.order), [1, undefined, 0, undefined, 7]);
});
