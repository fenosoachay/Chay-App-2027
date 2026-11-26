import test from "node:test";
import assert from "node:assert/strict";
import { styleBarres } from "./barresSysteme.js";

const doc = (sombre, mainSombre) => ({
  documentElement: { classList: { contains: (c) => c === "dark" && sombre } },
  querySelector: (s) => (s === "main.dark" && mainSombre ? {} : null),
});

test("thème sombre : icônes claires", () => assert.equal(styleBarres(doc(true, false)), "DARK"));
test("thème clair mais page à fond sombre imposé : icônes claires", () => assert.equal(styleBarres(doc(false, true)), "DARK"));
test("thème clair : icônes foncées", () => assert.equal(styleBarres(doc(false, false)), "LIGHT"));
test("sans document : icônes claires par défaut", () => assert.equal(styleBarres(null), "DARK"));
