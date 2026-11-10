import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { envoyerMessageTexte, isNetworkError } from "./messageSend.js";

const body = { conversation_id: "c1", text: "Bonjour", reply_to_id: null };
const deps = (over = {}) => {
  const file = [];
  const majs = [];
  return {
    file,
    majs,
    invoke: async () => ({ data: { id: "m1", created_date: "2026-11-11T08:00:00.000Z" } }),
    updateConversation: async (id, patch) => { majs.push([id, patch]); },
    enqueue: (type, payload) => file.push([type, payload]),
    ...over,
  };
};

test("réseau disponible : le message est envoyé, jamais mis en file (même si navigator.onLine était faux)", async () => {
  const d = deps();
  const r = await envoyerMessageTexte(d, body);
  assert.equal(r.statut, "envoye");
  assert.equal(d.file.length, 0);
  assert.deepEqual(d.majs[0], ["c1", { last_message_text: "Bonjour", last_message_at: "2026-11-11T08:00:00.000Z", typing_user_id: null, typing_at: null }]);
});

test("échec réseau réel : mis en file d'attente", async () => {
  for (const err of [Object.assign(new Error("injoignable"), { status: 0, code: "network_error" }), new TypeError("Failed to fetch")]) {
    const d = deps({ invoke: async () => { throw err; } });
    const r = await envoyerMessageTexte(d, body);
    assert.equal(r.statut, "en-attente");
    assert.deepEqual(d.file, [["message", { body }]]);
  }
});

test("refus du serveur (403, 429…) : erreur remontée, pas de file", async () => {
  const d = deps({ invoke: async () => { throw Object.assign(new Error("Forbidden"), { status: 403 }); } });
  await assert.rejects(envoyerMessageTexte(d, body), /Forbidden/);
  assert.equal(d.file.length, 0);
});

test("message créé mais aperçu de la conversation non mis à jour : considéré comme envoyé (pas de doublon)", async () => {
  const d = deps({ updateConversation: async () => { throw Object.assign(new Error("Too Many Requests"), { status: 429 }); } });
  assert.equal((await envoyerMessageTexte(d, body)).statut, "envoye");
});

test("isNetworkError", () => {
  assert.equal(isNetworkError({ status: 404 }), false);
  assert.equal(isNetworkError(new TypeError("x is not a function")), false);
  assert.equal(isNetworkError(null), false);
});

test("ConversationView et la file d'attente ne dépendent plus de navigator.onLine", () => {
  const code = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, ""); // sans commentaires
  const vue = code("../components/messages/ConversationView.jsx");
  assert.doesNotMatch(vue, /navigator\.onLine/);
  assert.match(vue, /envoyerMessageTexte\(/);
  assert.doesNotMatch(code("./offlineSync.js"), /navigator\.onLine/);
});
