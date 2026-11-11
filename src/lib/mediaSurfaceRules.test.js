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

test("YouTube : application externe dans l'APK Android, lecture intégrée sur le site", async () => {
  const { youtubeEnApplicationExterne, youtubeWatchUrl } = await import("./mediaSurfaceRules.js");
  assert.equal(youtubeEnApplicationExterne("android"), true);
  assert.equal(youtubeEnApplicationExterne("web"), false);
  assert.equal(youtubeEnApplicationExterne("ios"), false);
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

test("APK : YouTubeCategoryView et le lecteur commun ouvrent YouTube en externe ; le lecteur réduit s'arrête", () => {
  const code = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const vue = code("../components/media/YouTubeCategoryView.jsx");
  assert.match(vue, /youtubeEnApplicationExterne\(Capacitor\.getPlatform\(\)\)[\s\S]{0,40}openExternal\(youtubeWatchUrl\(item\.youtube_id\)\)/);
  const ums = code("../components/UniversalMediaSurface.jsx");
  assert.match(ums, /requested\.type === "youtube" && youtubeEnApplicationExterne\(Capacitor\.getPlatform\(\)\)/);
  assert.match(ums, /doitArreterYoutubeReduit\(control, youtubeAfficheRef\.current, isFullPlayer\)/);
});
