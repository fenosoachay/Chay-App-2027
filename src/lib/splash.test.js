import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BOOT_SPLASH_ID, SPLASH_COLORS, SPLASH_DURATION_MS, SPLASH_EXIT_S, SPLASH_GRADIENT, SPLASH_STEPS, removeBootSplash } from "./splash.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("durée : 4 secondes, apparitions lentes terminées avant la fin", () => {
  assert.equal(SPLASH_DURATION_MS, 4000);
  const fin = Math.max(...Object.values(SPLASH_STEPS).map((s) => s.delay + s.duration));
  assert.ok(fin <= SPLASH_DURATION_MS / 1000, `dernière apparition à ${fin} s`);
  assert.ok(Object.values(SPLASH_STEPS).every((s) => s.duration >= 0.8), "apparitions lentes");
  assert.ok(SPLASH_EXIT_S >= 0.5);
});

test("un toucher passe l'animation ; App utilise la durée commune", () => {
  const splash = lire("src/components/SplashScreen.jsx");
  assert.match(splash, /onClick=\{passer\}/);
  assert.match(splash, /aria-label="Passer l'animation d'accueil"/);
  const app = lire("src/App.jsx");
  assert.match(app, /setTimeout\(\(\) => setShowSplash\(false\), SPLASH_DURATION_MS\)/);
  assert.match(app, /onSkip=\{\(\) => setShowSplash\(false\)\}/);
});

test("même dégradé : natif Android, index.html, animation", () => {
  const xml = lire("android/app/src/main/res/drawable/splash_gradient.xml");
  assert.match(xml, new RegExp(`startColor="${SPLASH_COLORS[0]}"`));
  assert.match(xml, new RegExp(`centerColor="${SPLASH_COLORS[1]}"`));
  assert.match(xml, new RegExp(`endColor="${SPLASH_COLORS[2]}"`));
  const styles = lire("android/app/src/main/res/values/styles.xml");
  assert.equal((styles.match(/windowBackground">@drawable\/splash_gradient/g) || []).length, 2);
  const html = lire("index.html");
  assert.ok(html.includes(`id="${BOOT_SPLASH_ID}"`));
  assert.ok(html.includes(SPLASH_GRADIENT.replace("linear-gradient(", "linear-gradient(")));
  assert.equal(JSON.parse(lire("capacitor.config.json")).backgroundColor, "#00000000");
});

test("removeBootSplash : retire le fond de démarrage, sans erreur s'il est absent", () => {
  let retire = false;
  removeBootSplash({ getElementById: (id) => (id === BOOT_SPLASH_ID ? { remove: () => { retire = true; } } : null) });
  assert.equal(retire, true);
  removeBootSplash({ getElementById: () => null });
  removeBootSplash(null);
});
