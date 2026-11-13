import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dimensionsApercu, enregistrerFond, nomFichierFond, trierFonds, vignetteFond } from "./fondsEcran.js";
import { CATEGORIES } from "./mediaConstants.js";
import { nouvellesCollections } from "../../pocketbase/scripts/migrer-lot-e.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("fonds d'écran : ordre, vignette, nom de fichier, dimensions d'aperçu", () => {
  const l = trierFonds([{ title: "a", image_url: "https://x/a.jpg", created_date: "2026-01-01" }, { title: "b", image_url: "javascript:x" }, { title: "c", image_url: "https://x/c.jpg", order: 0 }]);
  assert.deepEqual(l.map((f) => f.title), ["c", "a"]);
  assert.equal(vignetteFond({ image_url: "https://x/a.jpg", thumb_url: "" }), "https://x/a.jpg");
  assert.equal(vignetteFond({ image_url: "https://x/a.jpg", thumb_url: "https://x/t.jpg" }), "https://x/t.jpg");
  assert.equal(nomFichierFond("Lumière du matin !"), "Lumiere-du-matin");
  assert.equal(nomFichierFond(""), "fond-ecran");
  assert.deepEqual(dimensionsApercu(8000, 16000), { w: 360, h: 720 });
  assert.deepEqual(dimensionsApercu(300, 400), { w: 300, h: 400 });
  assert.equal(dimensionsApercu(0, 10), null);
});

test("fonds d'écran : APK -> plugin natif (galerie) ; navigateur -> téléchargement du fichier", async () => {
  const appels = [];
  const ou = await enregistrerFond({ title: "Paix", image_url: "https://x/p.jpg" }, { natif: true, plugin: { enregistrerImage: async (o) => appels.push(o) } });
  assert.equal(ou, "galerie");
  assert.deepEqual(appels, [{ url: "https://x/p.jpg", nom: "Paix" }]);
  await assert.rejects(enregistrerFond({ image_url: "file:///x" }, { natif: true, plugin: {} }), /indisponible/);
  await assert.rejects(enregistrerFond({ image_url: "https://x/p.jpg" }, { natif: false, fetchImpl: async () => ({ ok: false, status: 404 }) }), /HTTP 404/);
});

test("fonds d'écran : section Multimédia, admin (200 Mo, vignette), plugin Android, schéma", () => {
  assert.ok(CATEGORIES.some((c) => c.id === "fonds" && c.label === "Fond d'écran"));
  assert.match(lire("src/components/media/MediaCategory.jsx"), /cat === "fonds" && <FondsEcran \/>/);
  assert.match(lire("src/components/admin/adminSections.js"), /key: "Wallpaper"[\s\S]*?apercu: "thumb_url"/);
  assert.match(lire("src/lib/upload.js"), /MAX_IMAGE = 200 \* MO/);
  const java = lire("android/app/src/main/java/io/chay/app/ChayGaleriePlugin.java");
  assert.match(java, /RELATIVE_PATH, Environment\.DIRECTORY_PICTURES \+ "\/" \+ DOSSIER/);
  assert.match(java, /MAX_OCTETS = 200L \* 1024 \* 1024/);
  assert.match(lire("android/app/src/main/java/io/chay/app/MainActivity.java"), /registerPlugin\(ChayGaleriePlugin\.class\)/);
  assert.match(lire("android/app/src/main/AndroidManifest.xml"), /WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/);
  const col = nouvellesCollections().find((c) => c.name === "Wallpaper");
  assert.deepEqual(col.fields.slice(0, 3).map((f) => f.name), ["title", "image_url", "thumb_url"]);
});
