import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanPersonalityProfile,
  cleanPersonalityQuestion,
  evaluatePersonalityQuiz,
  exportPersonalityQuizCsv,
  parsePersonalityQuizCsv,
  validatePersonalityQuizPackage,
} from "./personalityQuiz.js";
import initialQuiz from "../data/personality-quiz.json" with { type: "json" };

test("initial French package contains ten original questions and eight profiles", () => {
  const validated = validatePersonalityQuizPackage(initialQuiz);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.questions.length, 10);
  assert.equal(validated.profiles.length, 8);
});

test("question and profile validators reject malformed content", () => {
  assert.equal(cleanPersonalityQuestion({ ...initialQuiz.questions[0], answers: [] }, ["david"]), null);
  assert.equal(cleanPersonalityProfile({ ...initialQuiz.profiles[0], reference: "" }), null);
  assert.equal(cleanPersonalityQuestion(initialQuiz.questions[0], ["david"]), null);
});

test("score calculation returns a primary and near-tied secondary profile", () => {
  const questions = initialQuiz.questions.slice(0, 2);
  const outcome = evaluatePersonalityQuiz(questions, initialQuiz.profiles, {
    q1: "a1",
    q2: "a2",
  });
  assert.equal(outcome.primary.content_id, "david");
  assert.equal(outcome.secondary.content_id, "barnabas");
  assert.deepEqual(outcome.reasons.map((reason) => reason.answer), [
    "Je rassemble mon courage et je tente une première action concrète.",
    "Je l'écoute et je lui rappelle avec douceur ce qu'elle peut encore espérer.",
  ]);
});

test("tie breaking uses the administrator-defined profile order deterministically", () => {
  const profiles = initialQuiz.profiles.slice(0, 2);
  const tied = [{
    content_id: "tie-q",
    question: "Question?",
    answers: [
      { id: "d", text: "David", scores: { david: 2 } },
      { id: "e", text: "Esther", scores: { david: 2, esther: 2 } },
      { id: "j", text: "Joseph", scores: { joseph: 1 } },
      { id: "r", text: "Ruth", scores: { ruth: 1 } },
    ],
  }];
  const first = evaluatePersonalityQuiz(tied, profiles, { "tie-q": "e" });
  assert.equal(first.primary.content_id, "david");

  const reverseOrder = profiles.map((profile) => ({
    ...profile,
    sort_order: profile.content_id === "esther" ? 0 : 1,
  }));
  const second = evaluatePersonalityQuiz(tied, reverseOrder, { "tie-q": "e" });
  assert.equal(second.primary.content_id, "esther");
});

test("missing an answer prevents a result", () => {
  assert.equal(evaluatePersonalityQuiz(initialQuiz.questions.slice(0, 1), initialQuiz.profiles, {}), null);
});

test("CSV export and import preserve question scores and profile content", () => {
  const packageWithImageHistory = {
    ...initialQuiz,
    profiles: initialQuiz.profiles.map((profile, index) => ({
      ...profile,
      image_history: index === 0 ? ["https://storage.example/old-profile.webp"] : [],
    })),
  };
  const csv = exportPersonalityQuizCsv(packageWithImageHistory);
  const parsed = parsePersonalityQuizCsv(csv);
  const validated = validatePersonalityQuizPackage(parsed);
  assert.deepEqual(validated.errors, []);
  assert.deepEqual(validated.questions, packageWithImageHistory.questions);
  assert.deepEqual(validated.profiles, packageWithImageHistory.profiles.map(cleanPersonalityProfile));
});

test("CSV parser rejects broken quoting and row widths", () => {
  assert.throws(() => parsePersonalityQuizCsv('record_type,content_id\n"question,q1'));
  assert.throws(() => parsePersonalityQuizCsv('record_type,content_id\nquestion'));
});
