import assert from "node:assert/strict";
import test from "node:test";
import { lienReponse } from "./messagesSite.js";

test("répondre à un message du site : sujet Re, prénom, message cité", () => {
  const l = lienReponse({ name: "Marie Dupont", email: "marie@exemple.fr", subject: "Horaires", message: "Bonjour,\nÀ quelle heure ?", created_date: "2026-11-26T10:00:00Z" });
  assert.match(l, /^mailto:marie@exemple\.fr\?subject=/);
  const corps = decodeURIComponent(l.split("&body=")[1]);
  assert.equal(decodeURIComponent(l.split("subject=")[1].split("&")[0]), "Re : Horaires");
  assert.match(corps, /^Bonjour Marie,/);
  assert.match(corps, /> Bonjour,\n> À quelle heure \?/);
});
