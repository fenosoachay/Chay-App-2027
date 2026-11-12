import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("WebView : transparente au lancement (pas d'éclair), opaque dès la page chargée (vidéos visibles)", () => {
  assert.equal(JSON.parse(lire("capacitor.config.json")).backgroundColor, "#00000000");
  assert.match(lire("android/app/src/main/res/values/styles.xml"), /windowBackground">@drawable\/splash_gradient/);
  assert.match(lire("index.html"), /id="chay-boot-splash"/);
  const main = lire("android/app/src/main/java/io/chay/app/MainActivity.java");
  assert.match(main, /getBridge\(\)\.addWebViewListener\(new WebViewListener\(\) \{\s*@Override\s*public void onPageLoaded\(WebView view\) \{\s*view\.setBackgroundColor\(couleurFondOpaque\(\)\);/);
  assert.match(main, /Color\.rgb\(253, 251, 247\)/);
  // Accélération matérielle : jamais désactivée (nécessaire à la vidéo dans la WebView).
  assert.doesNotMatch(lire("android/app/src/main/AndroidManifest.xml"), /hardwareAccelerated="false"/);
  assert.doesNotMatch(main, /LAYER_TYPE_SOFTWARE/);
});
