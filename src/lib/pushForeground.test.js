import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PUSH_TEST_TARGET, foregroundPushToast } from "./pushForeground.js";

test("push de test reçu au premier plan : bandeau affiché", () => {
  const t = foregroundPushToast({ title: "Test de notification Chay", body: "Les notifications push fonctionnent sur cet appareil.", data: { target_type: "test" } });
  assert.equal(t.title, "Notification de test reçue");
  assert.match(t.description, /^Les notifications push fonctionnent sur cet appareil\. \(app ouverte/);
});

test("autres push au premier plan (message, contenu…) : rien (le bandeau in-app existe déjà)", () => {
  for (const target_type of ["message", "content", "community", "daily_verse", "", undefined]) {
    assert.equal(foregroundPushToast({ title: "x", body: "y", data: { target_type } }), null);
  }
  assert.equal(foregroundPushToast(null), null);
});

test("le bouton envoie target_type « test » et le hook affiche le bandeau", () => {
  const bouton = fs.readFileSync(new URL("../components/settings/PushTestButton.jsx", import.meta.url), "utf8");
  assert.match(bouton, /target_type: PUSH_TEST_TARGET/);
  const hook = fs.readFileSync(new URL("../hooks/usePushNotifications.js", import.meta.url), "utf8");
  assert.match(hook, /foregroundPushToast\(notification\)/);
  assert.equal(PUSH_TEST_TARGET, "test");
});
