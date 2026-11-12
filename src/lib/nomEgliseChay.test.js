import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SPLASH_DURATION_MS, SPLASH_EXIT_S, SPLASH_STEPS } from "./splash.js";

// Règle définitive (1.3.4) : « Chay » SEULEMENT sous l'icône Android (app_name, title_activity_main de l'activité
// de lancement, appName Capacitor) ; partout ailleurs « Église Chay », comme avant la 1.3.2.
const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("sous l'icône Android : « Chay » ; identifiant io.chay.app inchangé", () => {
  for (const f of ["android/app/src/main/res/values/strings.xml", "android/app/src/main/res/values-fr/strings.xml"]) {
    assert.match(lire(f), /<string name="app_name">Chay<\/string>/, f);
    assert.match(lire(f), /<string name="title_activity_main">Chay<\/string>/, f);
  }
  const cap = JSON.parse(lire("capacitor.config.json"));
  assert.equal(cap.appName, "Chay");
  assert.equal(cap.appId, "io.chay.app");
  assert.match(lire("android/app/src/main/AndroidManifest.xml"), /android:label="@string\/title_activity_main"/);
});

test("splash d'origine : « Église Chay », « EGC », devise malgache ; 4 s et toucher pour passer", () => {
  const s = lire("src/components/SplashScreen.jsx");
  assert.match(s, />\s*Église Chay\s*</);
  assert.match(s, />\s*EGC\s*</);
  assert.match(s, /Ny marina hahafaka anareo tsy ho andevo/);
  assert.match(s, /onSkip/);
  assert.equal(SPLASH_DURATION_MS, 4000);
  const fin = Math.max(...Object.values(SPLASH_STEPS).map((p) => p.delay + p.duration));
  assert.ok(fin + SPLASH_EXIT_S <= SPLASH_DURATION_MS / 1000 + 1e-9);
  assert.ok(SPLASH_STEPS.sigle);
});

test("« Église Chay » partout ailleurs : accueil, site, manifeste, médias, e-mails, push, serveur", () => {
  assert.match(lire("src/pages/Home.jsx"), /<span className="brand-gradient-text">ÉGLISE CHAY<\/span>/);
  assert.match(lire("index.html"), /<title>ÉGLISE CHAY<\/title>/);
  assert.equal(JSON.parse(lire("public/manifest.json")).name, "ÉGLISE CHAY");
  assert.match(lire("src/lib/appVersion.js"), /APP_NAME = "Église Chay"/);
  assert.match(lire("src/hooks/useWebMediaSession.js"), /"ÉGLISE CHAY"/);
  assert.match(lire("public/sw.js"), /"ÉGLISE CHAY"/);
  assert.match(lire("src/pages/Donate.jsx"), /Soutenir l'Église Chay/);
  assert.match(lire("pocketbase/pb_hooks/lib/courriel.js"), /Église Chay/);
  assert.match(lire("pocketbase/pb_hooks/lib/push.js"), /'ÉGLISE CHAY'/);
  assert.match(lire("pocketbase/sidecar-push/serveur.mjs"), /'ÉGLISE CHAY'/);
  assert.match(lire("pocketbase/scripts/configurer-production.mjs"), /appName: 'Église Chay'.*senderName: 'Église Chay'/);
  const auth = JSON.parse(lire("pocketbase/config/users-auth.json"));
  assert.match(JSON.stringify(auth), /Église Chay/);
  assert.doesNotMatch(JSON.stringify(auth), /— Chay"|application Chay|L’équipe Chay/);
  assert.match(lire("public/youtube-embed.html"), /<title>Lecteur vidéo Église Chay<\/title>/);
  assert.match(lire("android/app/src/main/java/io/chay/app/MediaNotificationService.java"), /"ÉGLISE CHAY"/);
});

test("le texte malgache « Fiangonana Chay » reste intact", () => {
  assert.match(lire("src/pages/Home.jsx"), /Tongasoa eto amin'ny Fiangonana Chay izay mitory/);
});
