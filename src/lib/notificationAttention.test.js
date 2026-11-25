import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { estMindset, notifierAutomatiquement, texteAttention } from "./notificationAttention.js";

test("1.3.34 : Mindset (Vidéo et Galerie) : pas de notification automatique, notification manuelle", () => {
  assert.ok(estMindset("Mindset"));
  assert.ok(estMindset("Mindset › Foi"));
  assert.ok(estMindset("Galerie › MINDSET"));
  assert.ok(!estMindset("Drôle"));
  assert.equal(notifierAutomatiquement("Video", "Mindset"), false);
  assert.equal(notifierAutomatiquement("GalleryImage", "Mindset › Été"), false);
  assert.equal(notifierAutomatiquement("Video", "Films"), true);
  assert.equal(notifierAutomatiquement("MusicTrack", "Mindset"), true);
  assert.equal(texteAttention("Video", "Sois fort"), "Chay attire ton attention sur cette vidéo : « Sois fort ».");
  assert.equal(texteAttention("GalleryImage", ""), "Chay attire ton attention sur cette photo.");
  const serveur = fs.readFileSync(new URL("../../pocketbase/pb_hooks/lib/notifications.js", import.meta.url), "utf8");
  assert.match(serveur, /Chay attire ton attention sur/);
});
