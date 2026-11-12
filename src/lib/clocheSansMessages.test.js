import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { visibleDansCloche } from "./routesNotification.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");

test("cloche : les messages privés (anciens compris) ne sont ni affichés ni comptés", () => {
  assert.equal(visibleDansCloche({ type: "message", content_type: "message", title: "X vous a envoyé un message" }), false);
  assert.equal(visibleDansCloche({ type: "x", content_type: "message" }), false);
  for (const type of ["new_content", "daily_verse", "like", "comment", "community_post", "theme_answer", "prayer_taken"]) {
    assert.equal(visibleDansCloche({ type }), true, type);
  }
  assert.equal(visibleDansCloche(null), false);
  assert.match(lire("src/pages/Notifications.jsx"), /rows\.filter\(visibleDansCloche\)/);
  assert.match(lire("src/hooks/useUnreadNotifications.js"), /rows\.filter\(visibleDansCloche\)\.length/);
  const bandeau = lire("src/components/NotificationBanner.jsx");
  assert.match(bandeau, /!visibleDansCloche\(n\)\) return;/);
  assert.match(bandeau, /visibleDansCloche\(notification\) &&/);
  // Filtre d'affichage seulement : aucune suppression des anciennes notifications.
  assert.doesNotMatch(lire("src/pages/Notifications.jsx"), /type === "message"[^\n]*delete/);
});

test("serveur : plus de UserNotification pour un message ; push et e-mail conservés, idempotence par mémo", () => {
  const s = lire("pocketbase/pb_hooks/lib/notifications.js");
  const corps = s.slice(s.indexOf("function messagePush("), s.indexOf("const messageNotificationError"));
  assert.doesNotMatch(corps, /newRecord\(\$app, 'UserNotification'/);
  assert.match(corps, /if \(memoMessage\('push', m\.id\)\) return/);
  assert.match(corps, /marquerMessage\('push', m\.id\)/);
  assert.match(corps, /memoMessage\('courriel', cle, EMAIL_DEDUP_MS\)/);
  assert.match(corps, /push\.sendToUsers\(pushTargets/);
});
