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
