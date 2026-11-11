import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Nom officiel de l'application : « Chay ». L'identifiant Android io.chay.app ne change pas.
const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const ANCIENS = /[ÉE]glise Chay|[ÉE]GLISE CHAY|"CHAY"|>CHAY</;

test("nom « Chay » : APK, site, manifeste, service worker", () => {
  assert.match(lire("android/app/src/main/res/values/strings.xml"), /<string name="app_name">Chay<\/string>/);
  assert.match(lire("android/app/src/main/res/values-fr/strings.xml"), /<string name="app_name">Chay<\/string>/);
  const cap = JSON.parse(lire("capacitor.config.json"));
  assert.equal(cap.appName, "Chay");
  assert.equal(cap.appId, "io.chay.app");
  assert.match(lire("index.html"), /<title>Chay<\/title>/);
  const man = JSON.parse(lire("public/manifest.json"));
  assert.equal(man.name, "Chay");
  assert.equal(man.short_name, "Chay");
});

test("plus aucun ancien nom dans l'interface, l'APK et les textes serveur", () => {
  const fichiers = [
    "index.html", "public/manifest.json", "public/sw.js", "capacitor.config.json",
    "android/app/src/main/res/values/strings.xml", "android/app/src/main/java/io/chay/app/MediaNotificationService.java",
    "src/components/SplashScreen.jsx", "src/pages/Home.jsx", "src/pages/Donate.jsx", "src/pages/Register.jsx", "src/lib/appVersion.js",
    "src/hooks/useWebMediaSession.js", "pocketbase/config/users-auth.json", "pocketbase/pb_hooks/lib/courriel.js",
    "pocketbase/pb_hooks/lib/push.js", "pocketbase/pb_hooks/fn_notifications.pb.js", "pocketbase/sidecar-push/serveur.mjs",
    "pocketbase/scripts/configurer-production.mjs",
  ];
  for (const f of fichiers) assert.doesNotMatch(lire(f), ANCIENS, f);
});

test("animation de départ : « Chay » seul, sans le sigle « EGC »", () => {
  const splash = lire("src/components/SplashScreen.jsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.match(splash, />\s*Chay\s*</);
  assert.doesNotMatch(splash, /\bEGC\b/);
  assert.doesNotMatch(lire("src/lib/splash.js"), /sigle/);
});

test("Accueil : grand titre « Chay », phrase malgache « Fiangonana Chay » conservée", () => {
  const home = lire("src/pages/Home.jsx");
  assert.match(home, /<span className="brand-gradient-text">Chay<\/span>/);
  assert.match(home, /Tongasoa eto amin'ny Fiangonana Chay/);
});
