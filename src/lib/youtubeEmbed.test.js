import test from "node:test";
import assert from "node:assert/strict";
import {
  buildYouTubeEmbedUrl,
  YOUTUBE_ORIGIN,
  YOUTUBE_REFERRER_POLICY,
} from "./youtubeEmbed.js";

test("YouTube embed URLs include the app origin and player API parameters", () => {
  const url = new URL(buildYouTubeEmbedUrl("abcdefghijk", "https://chay.base44.app"));

  assert.equal(url.origin, YOUTUBE_ORIGIN);
  assert.equal(url.pathname, "/embed/abcdefghijk");
  assert.equal(url.searchParams.get("origin"), "https://chay.base44.app");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(YOUTUBE_REFERRER_POLICY, "origin");
});

test("YouTube embed URL is omitted when a usable app origin is unavailable", () => {
  assert.equal(buildYouTubeEmbedUrl("abcdefghijk", "null"), null);
  assert.equal(buildYouTubeEmbedUrl("abcdefghijk", ""), null);
});

// ---- APK : page relais sur membres.chay.fr ----
import fs from "node:fs";
import vm from "node:vm";
import { lecteurYoutube, messageErreurYoutube, YOUTUBE_RELAIS_CHEMIN } from "./youtubeEmbed.js";

test("APK Android : le lecteur passe par la page relais du vrai domaine ; le site garde l'iframe directe", () => {
  const apk = lecteurYoutube({ platform: "android", pageOrigin: "https://localhost", relaisBase: "https://membres.chay.fr" });
  assert.equal(apk.relais, true);
  assert.equal(apk.origin, "https://membres.chay.fr");
  const u = new URL(apk.url("dQw4w9WgXcQ"));
  assert.equal(u.origin + u.pathname, `https://membres.chay.fr${YOUTUBE_RELAIS_CHEMIN}`);
  assert.equal(u.searchParams.get("v"), "dQw4w9WgXcQ");
  assert.equal(u.searchParams.get("parent"), "https://localhost");

  const web = lecteurYoutube({ platform: "web", pageOrigin: "https://membres.chay.fr", relaisBase: "https://membres.chay.fr" });
  assert.equal(web.relais, false);
  assert.equal(web.origin, YOUTUBE_ORIGIN);
  assert.equal(new URL(web.url("dQw4w9WgXcQ")).pathname, "/embed/dQw4w9WgXcQ");

  for (const relaisBase of ["http://membres.chay.fr", "", "pas une adresse"]) {
    const mauvais = lecteurYoutube({ platform: "android", pageOrigin: "https://localhost", relaisBase });
    assert.equal(mauvais.origin, null);
    assert.equal(mauvais.url("dQw4w9WgXcQ"), null); // -> repli « Ouvrir dans YouTube »
  }
});

test("messages d'erreur : intégration interdite, vidéo absente, lecteur injoignable", () => {
  for (const c of [101, 150, 152, 153]) assert.match(messageErreurYoutube(c), /n'autorise pas/);
  for (const c of [2, 5, 100]) assert.match(messageErreurYoutube(c), /indisponible/);
  for (const c of ["delai", "api", "relais", undefined]) assert.match(messageErreurYoutube(c), /n'a pas pu se charger/);
});

// Page relais public/youtube-embed.js exécutée dans un faux navigateur.
function relais(search) {
  const envoyes = [];
  const ecouteurs = [];
  const appels = [];
  const scripts = [];
  let options = null;
  const parent = { postMessage: (msg, cible) => envoyes.push({ msg: JSON.parse(msg), cible }) };
  const message = { textContent: "", style: {} };
  const win = {
    location: { search, origin: "https://membres.chay.fr" },
    parent,
    setInterval: () => 1,
    addEventListener: (type, fn) => { if (type === "message") ecouteurs.push(fn); },
    YT: {
      Player: function Player(id, opts) {
        options = opts;
        for (const f of ["playVideo", "pauseVideo", "stopVideo", "seekTo", "loadVideoById", "destroy"]) this[f] = (...a) => appels.push([f, ...a]);
        this.getCurrentTime = () => 12;
        this.getDuration = () => 300;
        this.getPlayerState = () => 1;
      },
    },
  };
  const doc = {
    getElementById: (id) => (id === "message" ? message : null),
    createElement: () => ({}),
    head: { appendChild: (s) => scripts.push(s) },
  };
  vm.runInNewContext(fs.readFileSync(new URL("../../public/youtube-embed.js", import.meta.url), "utf8"),
    { window: win, document: doc, URLSearchParams, JSON, Object, Array, Number });
  const recevoir = (data, origin = "https://localhost", source = parent) => ecouteurs.forEach((fn) => fn({ data, origin, source }));
  return { win, envoyes, appels, scripts, message, recevoir, options: () => options };
}

test("relais : refuse un parent non autorisé ou un identifiant invalide", () => {
  const r = relais("?v=dQw4w9WgXcQ&parent=https://pirate.example");
  assert.equal(r.envoyes.length, 0);
  assert.equal(r.scripts.length, 0);
  assert.match(r.message.textContent, /réservé/);
  const r2 = relais("?v=../x&parent=https://localhost");
  assert.deepEqual(r2.envoyes, [{ msg: { event: "onError", info: 2 }, cible: "https://localhost" }]);
});

test("relais : lecteur officiel (nocookie), événements renvoyés au parent, erreur d'intégration signalée", () => {
  const r = relais("?v=dQw4w9WgXcQ&parent=https://localhost");
  assert.equal(r.scripts[0].src, "https://www.youtube.com/iframe_api");
  r.win.onYouTubeIframeAPIReady();
  assert.equal(r.options().host, "https://www.youtube-nocookie.com");
  assert.equal(r.options().videoId, "dQw4w9WgXcQ");
  assert.equal(r.options().playerVars.origin, "https://membres.chay.fr");
  r.options().events.onReady();
  r.options().events.onStateChange({ data: 1 });
  r.options().events.onError({ data: 150 });
  assert.deepEqual(r.envoyes.map((e) => e.msg.event), ["ready", "onStateChange", "onError"]);
  assert.ok(r.envoyes.every((e) => e.cible === "https://localhost"));
  assert.equal(r.envoyes[2].msg.info, 150);
  r.scripts[0].onerror();
  assert.deepEqual(r.envoyes.at(-1).msg, { event: "onError", info: "api" });
});

test("relais : n'obéit qu'au parent autorisé, et seulement à 4 commandes", () => {
  const r = relais("?v=dQw4w9WgXcQ&parent=https://localhost");
  r.win.onYouTubeIframeAPIReady();
  r.appels.length = 0;
  const cmd = (func, args = []) => JSON.stringify({ event: "command", func, args });
  r.recevoir(cmd("pauseVideo"), "https://pirate.example");
  r.recevoir(cmd("pauseVideo"), "https://localhost", {});
  r.recevoir(cmd("destroy"));
  r.recevoir(cmd("loadVideoById", ["autre"]));
  r.recevoir(cmd("seekTo", [-1, true]));
  assert.deepEqual(r.appels, []);
  r.recevoir(cmd("pauseVideo"));
  r.recevoir(cmd("seekTo", [42, true, "en trop"]));
  r.recevoir(cmd("playVideo", ["ignoré"]));
  assert.deepEqual(r.appels, [["pauseVideo"], ["seekTo", 42, true], ["playVideo"]]);
});
