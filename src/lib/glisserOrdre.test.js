import test from "node:test";
import assert from "node:assert/strict";
import { appliquerOrdre, deplacer, ordreChange, positionCible } from "./glisserOrdre.js";

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

test("positionCible : suit le doigt (milieux 50/150/250/350)", () => {
  const m = [50, 150, 250, 350];
  assert.equal(positionCible(m, 10, 0), 0);
  assert.equal(positionCible(m, 160, 0), 1); // passé le milieu de b
  assert.equal(positionCible(m, 400, 0), 3);
  assert.equal(positionCible(m, 10, 3), 0);
  assert.equal(positionCible(m, 340, 3), 3); // encore sous le milieu de c : reste en bas
  assert.equal(positionCible(m, 240, 3), 2); // au-dessus du milieu de c : passe devant
  assert.equal(positionCible(m, 140, 2), 1);
});

test("glisser pas à pas (comme pointermove) : a passe sous c", () => {
  let ordre = l;
  let index = 0;
  for (const y of [60, 160, 260]) {
    const milieux = ordre.map((_, i) => 50 + i * 100);
    const vers = positionCible(milieux, y, index);
    ordre = deplacer(ordre, index, vers);
    index = vers;
  }
  assert.equal(ids(ordre), "bcad");
});

test("ordreChange et appliquerOrdre", () => {
  assert.equal(ordreChange(l, [...l]), false);
  assert.equal(ordreChange(l, deplacer(l, 0, 1)), true);
  const r = appliquerOrdre([...l, { id: "z", order: 7 }], [l[2], l[0]], "order");
  assert.deepEqual(r.map((e) => e.order), [1, undefined, 0, undefined, 7]);
});
