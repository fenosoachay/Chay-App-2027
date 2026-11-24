import test from "node:test";
import assert from "node:assert/strict";
import { texteVerset } from "./partage.js";
import { concerne, IMAGE_ATTENTE } from "./attenteMedia.js";

test("partage du verset : référence [LSG], lignes vides, numéro du verset, lien de l'APK", () => {
  assert.equal(
    texteVerset("Genèse 3:21", "L'Eternel Dieu fit à Adam et à sa femme des habits de peau, et il les en revêtit."),
    "Genèse 3:21 [LSG]\n\n21. L'Eternel Dieu fit à Adam et à sa femme des habits de peau, et il les en revêtit.\n\nhttps://membres.chay.fr/telechargements/chay.apk"
  );
  assert.equal(texteVerset("Psaume 23", "L'Eternel est mon berger"), "Psaume 23 [LSG]\n\nL'Eternel est mon berger\n\nhttps://membres.chay.fr/telechargements/chay.apk");
});

test("image d'attente : photos et vidéos distantes seulement", () => {
  const el = (tagName, src, dataset = {}) => ({ tagName, dataset, getAttribute: () => src });
  assert.equal(concerne(el("IMG", "https://r2.chay.fr/a.jpg")), true);
  assert.equal(concerne(el("IMG", "/assets/logo.png")), false);
  assert.equal(concerne(el("IMG", "data:image/png;base64,xx")), false);
  assert.equal(concerne(el("IMG", `https://membres.chay.fr${IMAGE_ATTENTE}`)), false);
  assert.equal(concerne(el("VIDEO", "")), true);
  assert.equal(concerne(el("IMG", "https://x/a.jpg", { sansAttente: "" })), false);
  assert.equal(concerne(null), false);
});
