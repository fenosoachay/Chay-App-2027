import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  TAILLES, caseSuivante, casesDuMot, casesFausses, genererGrille, grilleJuste, motDeCase, motSuivant, normaliserMot, pointsGrille,
} from "./motsCroises.js";

const MOTS = JSON.parse(fs.readFileSync(new URL("../data/motsCroises.json", import.meta.url), "utf8"));
const hasard = (graine) => { let s = graine; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

/** Tous les segments de 2 lettres ou plus (lignes et colonnes) doivent être des mots placés. */
function segments(cases) {
  const n = cases.length;
  const out = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      for (const [dr, dc, dir] of [[0, 1, "h"], [1, 0, "v"]]) {
        if (!cases[r][c] || (r - dr >= 0 && c - dc >= 0 && cases[r - dr][c - dc])) continue;
        let s = "";
        for (let k = 0; r + dr * k < n && c + dc * k < n && cases[r + dr * k][c + dc * k]; k += 1) s += cases[r + dr * k][c + dc * k];
        if (s.length >= 2) out.push({ r, c, dir, s });
      }
    }
  }
  return out;
}

test("1.3.31 : base de départ — mots en majuscules sans accents, définition et référence", () => {
  assert.ok(MOTS.length >= 200);
  assert.equal(new Set(MOTS.map((m) => m.mot)).size, MOTS.length);
  for (const m of MOTS) {
    assert.equal(normaliserMot(m.mot), m.mot);
    assert.ok(m.mot.length >= 3 && m.mot.length <= 11, m.mot);
    assert.ok(m.definition && m.reference, m.mot);
  }
  assert.equal(normaliserMot("Moïse"), "MOISE");
});

test("grilles : chaque taille a ses mots, qui se lisent bien ; aucun faux mot ; chaque mot en croise un autre", () => {
  for (const t of TAILLES) {
    for (let graine = 1; graine <= 25; graine += 1) {
      const g = genererGrille(MOTS, t.id, t.nbMots, hasard(graine * 97 + t.id));
      assert.ok(g.mots.length >= t.nbMots - 1, `${t.id} × ${t.id} : ${g.mots.length} mots`);
      const places = new Set(g.mots.map((m) => `${m.r}-${m.c}-${m.dir}-${m.mot}`));
      for (const s of segments(g.cases)) assert.ok(places.has(`${s.r}-${s.c}-${s.dir}-${s.s}`), `faux mot « ${s.s} »`);
      for (const m of g.mots) {
        assert.ok(m.definition && m.num > 0);
        assert.ok(m.longueur <= t.id);
        const autres = new Set(g.mots.filter((x) => x !== m).flatMap(casesDuMot));
        assert.ok(casesDuMot(m).some((k) => autres.has(k)), `${m.mot} ne croise rien`);
      }
    }
  }
});

test("navigation, vérification et points", () => {
  const g = genererGrille(MOTS, 9, 10, hasard(7));
  const m = g.mots[0];
  const cases = casesDuMot(m);
  const [r, c] = cases[0].split("-").map(Number);
  assert.equal(motDeCase(g, r, c, m.dir), m);
  const saisies = {};
  assert.equal(caseSuivante(m, cases[0], saisies), cases[1]);
  cases.forEach((k, i) => { saisies[k] = m.mot[i]; });
  assert.notEqual(motSuivant(g, m, saisies), m);
  const toutes = {};
  g.cases.forEach((l, rr) => l.forEach((x, cc) => { if (x) toutes[`${rr}-${cc}`] = x; }));
  assert.equal(grilleJuste(g, toutes), true);
  assert.equal(motSuivant(g, m, toutes), null);
  toutes[cases[0]] = toutes[cases[0]] === "A" ? "B" : "A";
  assert.equal(grilleJuste(g, toutes), false);
  assert.deepEqual([...casesFausses(g, toutes)], [cases[0]]);
  assert.equal(pointsGrille(7, 0, 100), 36);
  assert.equal(pointsGrille(7, 0, 200), 30);
  assert.equal(pointsGrille(11, 2, 900), 80);
  assert.equal(pointsGrille(9, 20, 900), 5);
  assert.equal(pointsGrille(9, 0, 5), 0);
  assert.equal(pointsGrille(8, 0, 100), 0);
});
