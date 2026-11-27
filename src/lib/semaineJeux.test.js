import test from "node:test";
import assert from "node:assert/strict";
import { prochainLundi } from "./semaineJeux.js";

test("1.4.1 : prochaine remise à zéro du classement des jeux : le lundi suivant", () => {
  assert.equal(prochainLundi(new Date(2026, 10, 27)), "lundi 30 novembre"); // vendredi
  assert.equal(prochainLundi(new Date(2026, 10, 30)), "lundi 7 décembre"); // un lundi : le suivant
  assert.equal(prochainLundi(new Date(2027, 1, 27)), "lundi 1er mars");
});
