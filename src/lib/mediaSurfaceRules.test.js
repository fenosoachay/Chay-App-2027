import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { allowsFullPlayer, isAudioControl, opensFullPlayerOnRequest } from "./mediaSurfaceRules.js";

test("radio : jamais de plein écran (ni à la demande, ni au démarrage)", () => {
  assert.equal(allowsFullPlayer({ type: "radio", engine: "radio", isLive: true }), false);
  assert.equal(opensFullPlayerOnRequest("radio"), false);
});

test("audio : jamais de plein écran", () => {
  for (const type of ["audio", "music", "sermon", "predication", "bible"]) assert.equal(allowsFullPlayer({ type }), false);
  assert.equal(isAudioControl({ type: "x", engine: "audio" }), true);
});

test("vidéo et YouTube : plein écran", () => {
  assert.equal(allowsFullPlayer({ type: "video" }), true);
  assert.equal(allowsFullPlayer({ type: "youtube" }), true);
  assert.equal(opensFullPlayerOnRequest("video"), true);
  assert.equal(opensFullPlayerOnRequest("youtube"), true);
  assert.equal(allowsFullPlayer(null), false);
});

test("UniversalMediaSurface applique la règle ; RadioContext garde la publication du contrôle (son et notification)", () => {
  const ums = fs.readFileSync(new URL("../components/UniversalMediaSurface.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ums, /control\.type === "radio"\) setExpanded\(true\)/);
  assert.doesNotMatch(ums, /requested\.type === "radio"/);
  assert.match(ums, /const isFullPlayer = expanded && allowsFullPlayer\(control\);/);
  const radio = fs.readFileSync(new URL("./RadioContext.jsx", import.meta.url), "utf8");
  assert.match(radio, /publishMediaControl\(/);
  assert.match(radio, /type: "radio"/);
});

test("YouTube : lien de repli « Ouvrir dans YouTube »", async () => {
  const mod = await import("./mediaSurfaceRules.js");
  const { youtubeWatchUrl } = mod;
  assert.equal("youtubeEnApplicationExterne" in mod, false); // plus d'ouverture externe systématique
  assert.equal(youtubeWatchUrl("dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(youtubeWatchUrl("a&b"), "https://www.youtube.com/watch?v=a%26b");
});

test("YouTube réduit : arrêté (plus de lecteur caché qui joue le son)", async () => {
  const { doitArreterYoutubeReduit } = await import("./mediaSurfaceRules.js");
  const yt = { type: "youtube" };
  assert.equal(doitArreterYoutubeReduit(yt, true, false), true);  // plein écran -> réduit
  assert.equal(doitArreterYoutubeReduit(yt, false, false), false); // jamais affiché
  assert.equal(doitArreterYoutubeReduit(yt, true, true), false);   // toujours affiché
  assert.equal(doitArreterYoutubeReduit({ type: "video" }, true, false), false); // la vidéo mp4 continue en mini-lecteur
});

test("APK : YouTube lu dans l'app (relais), repli « Ouvrir dans YouTube » seulement sur échec ; le lecteur réduit s'arrête", () => {
  const code = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  const vue = code("../components/media/YouTubeCategoryView.jsx");
  assert.doesNotMatch(vue, /openExternal|youtubeEnApplicationExterne/);
  const ums = code("../components/UniversalMediaSurface.jsx");
  assert.doesNotMatch(ums, /youtubeEnApplicationExterne/);
  assert.match(ums, /lecteurYoutube\(\{/);
  assert.match(ums, /const url = LECTEUR_YT\.url\(source\)/);
  assert.equal((ums.match(/openExternal\(youtubeWatchUrl/g) || []).length, 1); // uniquement le bouton de repli
  assert.match(ums, /isYouTube && erreurYoutube && erreurYoutube\.source === control\?\.source/);
  assert.match(ums, /Ouvrir dans YouTube/);
  assert.match(ums, /data\?\.event === "onError"/);
  assert.match(ums, /doitArreterYoutubeReduit\(control, youtubeAfficheRef\.current, isFullPlayer\)/);
});

test("APK : pendant YouTube, la balise <video> est retirée de la mise en page (sinon iframe poussée hors du cadre = image noire)", async () => {
  const { classeVideoLecteur } = await import("./mediaSurfaceRules.js");
  assert.equal(classeVideoLecteur({ isNativeAndroidPlayer: true, isVideo: false }), "hidden"); // YouTube dans l'APK
  assert.equal(classeVideoLecteur({ isNativeAndroidPlayer: false, isVideo: false }), "hidden"); // YouTube sur le site
  assert.equal(classeVideoLecteur({ isNativeAndroidPlayer: true, isVideo: true }), "block opacity-0"); // image par ExoPlayer
  assert.equal(classeVideoLecteur({ isNativeAndroidPlayer: false, isVideo: true }), "block");
  const ums = fs.readFileSync(new URL("../components/UniversalMediaSurface.jsx", import.meta.url), "utf8");
  assert.match(ums, /object-contain \$\{classeVideoLecteur\(\{ isNativeAndroidPlayer, isVideo \}\)\}/);
  assert.doesNotMatch(ums, /isNativeAndroidPlayer \? "opacity-0"/);
  // Les seules couches au-dessus de l'iframe : poster/spinner (vidéo seulement) et le repli d'erreur YouTube.
  assert.match(ums, /showVideoSpinner = Boolean\(isVideo && videoWaiting\)/);
  // La vue native ExoPlayer n'est rendue visible que pour une vidéo.
  assert.match(ums, /const visible = Boolean\(showEmbeddedPlayer && isVideo && rect/);
});
