import assert from "node:assert/strict";
import test from "node:test";
import { emojiDe, prochaineReaction, resumeReactions } from "./reactions.js";

test("réagir : ajouter, changer, retirer", () => {
  assert.deepEqual(prochaineReaction(null, "haha"), { type: "ajouter", reaction: "haha" });
  assert.deepEqual(prochaineReaction("like", "like"), { type: "retirer" });
  assert.deepEqual(prochaineReaction("like", "coeur"), { type: "changer", reaction: "coeur" });
});

test("résumé : anciens « J'aime » = cœur, plus fréquent d'abord (égalité : ordre 👍 ❤️ 😂)", () => {
  const r = resumeReactions([{ reaction: "haha" }, {}, { reaction: "haha" }, { reaction: "like" }, { reaction: "inconnu" }]);
  assert.deepEqual(r.map((x) => [x.value, x.n]), [["coeur", 2], ["haha", 2], ["like", 1]]);
  assert.deepEqual(resumeReactions([]), []);
  assert.equal(emojiDe("like"), "👍");
  assert.equal(emojiDe(undefined), "❤️");
});
