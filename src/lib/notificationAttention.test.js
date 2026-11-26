import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { estMindset, notifierAutomatiquement, texteAttention } from "./notificationAttention.js";

test("1.3.34 : Mindset (Vidéo et Galerie) : pas de notification automatique, notification manuelle", () => {
  assert.ok(estMindset("Mindset"));
  assert.ok(estMindset("Mindset › Foi"));
  assert.ok(estMindset("Galerie › MINDSET"));
  assert.ok(!estMindset("Drôle"));
  // 1.3.43 : automatique ET manuelle (le bouton 🔔 reste pour relancer).
  assert.equal(notifierAutomatiquement("Video", "Mindset"), true);
  assert.equal(notifierAutomatiquement("GalleryImage", "Mindset › Été"), true);
  assert.equal(notifierAutomatiquement("Video", "Films"), true);
  assert.equal(notifierAutomatiquement("MusicTrack", "Mindset"), true);
  assert.equal(texteAttention("Video", "Sois fort"), "Chay attire ton attention sur cette vidéo : « Sois fort ».");
  assert.equal(texteAttention("GalleryImage", ""), "Chay attire ton attention sur cette photo.");
  // 1.3.43 : toutes les natures de contenu.
  assert.equal(texteAttention("Sermon", "La foi"), "Chay attire ton attention sur cette prédication : « La foi ».");
  assert.equal(texteAttention("MusicTrack", "Alléluia"), "Chay attire ton attention sur ce chant : « Alléluia ».");
  assert.equal(texteAttention("Article", "Noël"), "Chay attire ton attention sur cet article : « Noël ».");
  assert.equal(texteAttention("Announcement", "Culte", "reunion"), "Chay attire ton attention sur cette réunion : « Culte ».");
  assert.equal(texteAttention("Inconnu", "X"), "Chay attire ton attention sur ce contenu : « X ».");
  const serveur = fs.readFileSync(new URL("../../pocketbase/pb_hooks/lib/notifications.js", import.meta.url), "utf8");
  assert.match(serveur, /Chay attire ton attention sur/);
});

test("1.3.36 : « Pédagogie en image » comme Mindset (notification à la main seulement)", () => {
  assert.ok(estMindset("Pédagogie en image"));
  assert.ok(estMindset("Galerie › Pédagogie en images"));
  assert.ok(estMindset("PÉDAGOGIE EN IMAGE › Foi"));
  assert.ok(!estMindset("Pédagogie"));
  assert.equal(notifierAutomatiquement("GalleryImage", "Pédagogie en image"), true);
});
