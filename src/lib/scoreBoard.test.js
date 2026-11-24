import assert from "node:assert/strict";
import test from "node:test";
import { chargerLib } from "../../pocketbase/tests/charger-cjs.mjs";

const sc = chargerLib("scores.js");

test("score board : points par jeu (bornés)", () => {
  assert.equal(sc.pointsQuiz(4, "easy"), 40);
  assert.equal(sc.pointsQuiz(4, "hard"), 120);
  assert.equal(sc.pointsMemory(3, "difficile"), 90);
  assert.equal(sc.pointsMemory(4, "facile"), 0);
  assert.equal(sc.pointsBrique(2345), 234);
  assert.equal(sc.pointsBrique(999999), 1000);
  assert.equal(sc.pointsPuzzle(16), 80);
  assert.equal(sc.pointsPuzzle(15), 0);
  assert.equal(sc.pointsClient("emoji", { score: 70 }), 70);
  assert.equal(sc.pointsClient("inconnu", { score: 70 }), 0);
});

test("score board : pseudo et avatar d'enfant", () => {
  assert.equal(sc.pseudoValide("  Miora  "), "Miora");
  assert.equal(sc.pseudoValide("Élie-Noé"), "Élie-Noé");
  assert.equal(sc.pseudoValide("a"), "");
  assert.equal(sc.pseudoValide("<script>"), "");
  assert.equal(sc.avatarValide("🐑"), "🐑");
  assert.equal(sc.avatarValide("💣"), sc.AVATARS[0]);
});

test("score board : début de semaine et de mois (heure de Paris)", () => {
  // Samedi 21 novembre 2026, 10 h UTC (11 h à Paris, UTC+1).
  const t = Date.UTC(2026, 10, 21, 10);
  assert.equal(new Date(sc.debutPeriode("semaine", t, 60)).toISOString(), "2026-11-15T23:00:00.000Z"); // lundi 16, 0 h Paris
  assert.equal(new Date(sc.debutPeriode("mois", t, 60)).toISOString(), "2026-10-31T23:00:00.000Z"); // 1er novembre, 0 h Paris
  assert.equal(sc.debutPeriode("toujours", t, 60), 0);
  // Dimanche 23 h 30 à Paris : encore la même semaine.
  assert.equal(new Date(sc.debutPeriode("semaine", Date.UTC(2026, 10, 22, 22, 30), 60)).toISOString(), "2026-11-15T23:00:00.000Z");
});

test("score board : classement avec ex aequo", () => {
  const l = sc.classer([
    { cle: "a", points: 30 }, { cle: "b", points: 50 }, { cle: "a", points: 20 }, { cle: "c", points: 10 }, { cle: "d", points: 0 },
  ]);
  assert.deepEqual(l.map((x) => [x.cle, x.points, x.rang]), [["a", 50, 1], ["b", 50, 1], ["c", 10, 3]]);
});

test("score board 1.3.26 : le Puzzle est un jeu d'enfant (sauf ancienne app sans pseudo)", () => {
  assert.deepEqual(sc.JEUX.enfant, ["memory", "puzzle", "brique"]);
  assert.equal(sc.JEUX.adulte.includes("puzzle"), false);
  assert.equal(sc.JEUX.adulte.includes("brique"), false); // 1.3.29
  assert.equal(sc.espaceDe("brique", "Mickael"), "enfant");
  assert.equal(sc.espaceDe("brique", ""), "adulte");
  assert.equal(sc.espaceDe("memory", "Mickael"), "enfant");
  assert.equal(sc.espaceDe("puzzle", "Mickael"), "enfant");
  assert.equal(sc.espaceDe("puzzle", ""), "adulte");
  assert.equal(sc.espaceDe("emoji", "Mickael"), "adulte");
});
