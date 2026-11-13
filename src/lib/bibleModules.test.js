import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("Bible : ordre des modules Lire la Bible, Sagesse en audio, Dictionnaire, Concordance, Mes notes", () => {
  const page = lire("src/pages/Bible.jsx");
  const ordre = [...page.matchAll(/openView\("(\w+)"\)\}/g)].map((m) => m[1]);
  assert.deepEqual(ordre, ["reader", "sagesse", "dictionary", "concordance", "notes"]);
  assert.match(page, />Lire la Bible<\/h2>/);
});

