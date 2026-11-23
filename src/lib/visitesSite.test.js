import test from "node:test";
import assert from "node:assert/strict";
import { totauxVisites } from "./visitesSite.js";

test("visites : aujourd'hui, semaine (depuis lundi), mois, année", () => {
  const lignes = [
    { jour: "2026-11-25", visites: 4 }, // mercredi (aujourd'hui)
    { jour: "2026-11-23", visites: 3 }, // lundi
    { jour: "2026-11-22", visites: 10 }, // dimanche : semaine précédente
    { jour: "2026-11-01", visites: 2 },
    { jour: "2026-10-31", visites: 5 },
    { jour: "2025-12-31", visites: 7 },
    { jour: "2026-11-26", visites: 99 }, // futur : ignoré
    { jour: "n'importe quoi", visites: 50 },
  ];
  assert.deepEqual(totauxVisites(lignes, new Date(2026, 10, 25, 15)), { jour: 4, semaine: 7, mois: 19, annee: 24 });
  assert.deepEqual(totauxVisites([], new Date(2026, 0, 1)), { jour: 0, semaine: 0, mois: 0, annee: 0 });
});
