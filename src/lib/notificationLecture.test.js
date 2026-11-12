import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { filePlaylist, routeTitre } from "./fileLecture.js";
import { buildFavoriteAudioQueue } from "./favoriteAudioQueue.js";
import { createMediaNotificationState } from "./mediaNotificationState.js";
import { routeValide } from "./routesNotification.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const JAVA = "android/app/src/main/java/io/chay/app/";

test("chaque titre lu porte la route de son écran (Musique, Prédication, Votre Playlist, Radio)", () => {
  const [m] = filePlaylist([{ track_id: "t1", playlist_id: "charisma", audio_url: "https://a/1" }], "music");
  assert.equal(m.route, "/media?cat=music&playlist=charisma&track=t1");
  const [p] = filePlaylist([{ track_id: "s1", playlist_id: "p", audio_url: "https://a/2" }], "sermons");
  assert.equal(p.route, "/media?cat=sermons&playlist=p&track=s1");
  const { tracks } = buildFavoriteAudioQueue([{ id: "f1", track_id: "t1", audio_url: "https://a/1", category: "music" }], "f1");
  assert.equal(tracks[0].route, "/media?cat=playlist&favori=f1");
  assert.match(lire("src/lib/RadioContext.jsx"), /route: "\/media\?cat=radio"/);
  for (const r of [m.route, p.route, tracks[0].route, "/media?cat=radio", routeTitre("music", "a&b", "c")]) assert.ok(routeValide(r), r);
  assert.equal(createMediaNotificationState({ title: "x", route: m.route }).route, m.route);
  assert.equal(createMediaNotificationState({ title: "x" }).route, "");
});

test("natif : la notification maison ET la session ExoPlayer ouvrent MainActivity avec la route", () => {
  const rm = lire(`${JAVA}RouteMedia.java`);
  assert.match(rm, /new Intent\(ctx, MainActivity\.class\)/);
  assert.match(rm, /if \(valide\(route\)\) i\.putExtra\(EXTRA, route\);/);
  assert.match(rm, /PendingIntent\.FLAG_IMMUTABLE/);
  assert.match(lire(`${JAVA}MediaNotificationService.java`), /builder\.setContentIntent\(RouteMedia\.intention\(this, route\)\);/);
  assert.match(lire(`${JAVA}AndroidMediaNotificationPlugin.java`), /EXTRA_ROUTE, call\.getString\("route", ""\)/);
  const session = lire(`${JAVA}ChayMediaSessionService.java`);
  assert.match(session, /\.setSessionActivity\(RouteMedia\.intention\(this, routeCourante\)\)/);
  assert.match(session, /instance\.mediaSession\.setSessionActivity\(RouteMedia\.intention\(ctx, route\)\)/);
  assert.match(lire(`${JAVA}AndroidExoPlayerPlugin.java`), /ChayMediaSessionService\.definirRoute\(getContext\(\), route\);/);
  assert.match(lire(`${JAVA}ChayConversationPlugin.java`), /notifyListeners\("ouvrir", data, true\)/);
});

test("app : écoute « ouvrir » dans le Layout (sans dépendre du push), route du titre transmise au natif", () => {
  assert.match(lire("src/components/Layout.jsx"), /useOuvrirDepuisLecture\(navigate\);/);
  assert.match(lire("src/hooks/useOuvrirDepuisLecture.js"), /if \(routeValide\(data\?\.route\)\) navigate\(data\.route\);/);
  const ctx = lire("src/lib/AudioPlayerContext.jsx");
  assert.equal((ctx.match(/route: currentTrack\.route \|\| ""/g) || []).length, 2); // ExoPlayer + notification
  assert.match(lire("src/components/media/FavoritesView.jsx"), /searchParams\.get\("favori"\)/);
});
