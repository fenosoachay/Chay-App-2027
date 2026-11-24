import test from "node:test";
import assert from "node:assert/strict";
import { debutsScoreBoard, lignesHistoriques, pointsBrique, pointsQuiz, pointsScramble } from "../../pocketbase/scripts/migrer-1-3-27.mjs";

test("1.3.27 : début du Score Board par jeu (scores normaux des adultes seulement)", () => {
  const d = debutsScoreBoard([
    { espace: "adulte", jeu: "trivia", created: "2026-11-10 10:00:00.000Z" },
    { espace: "adulte", jeu: "trivia", created: "2026-11-05 10:00:00.000Z" },
    { espace: "adulte", jeu: "brique", created: "2026-11-07 10:00:00.000Z", historique: true },
    { espace: "enfant", jeu: "memory", created: "2026-11-01 10:00:00.000Z" },
  ]);
  assert.deepEqual(d, { trivia: "2026-11-05 10:00:00.000Z" });
});

test("1.3.27 : Quiz repris (bonnes réponses d'avant, × niveau)", () => {
  const q = [{ id: "q1", difficulty: "easy" }, { id: "q2", difficulty: "hard" }];
  const r = [
    { user_id: "a", question_id: "q1", is_correct: true, answered_at: "2026-10-01T10:00:00Z" },
    { user_id: "a", question_id: "q2", is_correct: true, answered_at: "2026-10-01 10:00:00.000Z" },
    { user_id: "a", question_id: "q2", is_correct: false, answered_at: "2026-10-01 10:00:00.000Z" },
    { user_id: "b", question_id: "q1", is_correct: true, answered_at: "2026-11-06 10:00:00.000Z" }, // après : déjà compté
  ];
  assert.deepEqual(pointsQuiz(r, q, "2026-11-05 10:00:00.000Z"), { a: 40 });
  assert.deepEqual(pointsQuiz(r, q, undefined), { a: 40, b: 10 });
});

test("1.3.27 : Mots mélangés par partie (1 000 au plus) et Brique (score / 10)", () => {
  const h = [
    { user_id: "a", session_id: "s1", solved: true, score_earned: 700, played_at: "2026-10-01 10:00:00Z" },
    { user_id: "a", session_id: "s1", solved: true, score_earned: 600, played_at: "2026-10-01 10:00:00Z" },
    { user_id: "a", session_id: "s2", solved: true, score_earned: 50, played_at: "2026-10-02 10:00:00Z" },
    { user_id: "a", session_id: "s3", solved: false, score_earned: 99, played_at: "2026-10-02 10:00:00Z" },
  ];
  assert.deepEqual(pointsScramble(h), { a: 1050 });
  assert.deepEqual(pointsBrique([{ user_id: "c", score: 25000, played_at: "2026-10-01" }, { user_id: "c", score: 123, created: "2026-10-03 10:00:00.000Z" }]), { c: 1012 });
});

test("1.3.27 : une ligne historique par membre et par jeu (coupée au-delà de 100 000)", () => {
  const l = lignesHistoriques({ trivia: { a: 40, b: 150000 }, brique: {} });
  assert.deepEqual(l.map((x) => [x.user_id, x.jeu, x.points, x.historique]), [["a", "trivia", 40, true], ["b", "trivia", 100000, true], ["b", "trivia", 50000, true]]);
});
