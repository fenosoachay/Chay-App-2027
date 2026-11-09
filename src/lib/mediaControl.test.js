import test from "node:test";
import assert from "node:assert/strict";
import {
  getMediaControlKey,
  registerMediaControl,
  publishMediaControl,
  requestMediaPlayback,
  stopActiveMediaControl,
  subscribeMediaControl,
  subscribeMediaPlaybackRequests,
  surfaceHandlersMissing,
  updateMediaControl,
} from "./mediaControl.js";

test("media control keys stringify Symbol ids before React interpolation", () => {
  assert.equal(
    getMediaControlKey({ id: Symbol("music"), source: "track.mp3" }),
    "Symbol(music):track.mp3"
  );
  assert.equal(getMediaControlKey(null), null);
});

test("registered media control is published and removed by its disposer", () => {
  let latest;
  const unsubscribe = subscribeMediaControl((control) => { latest = control; });
  const dispose = registerMediaControl({
    type: "film",
    title: "Un film",
    isPlaying: true,
    toggle() {},
    stop() {},
  });

  assert.equal(latest.title, "Un film");
  dispose();
  assert.equal(latest, null);
  unsubscribe();
});

test("stopActiveMediaControl invokes stop and clears the active control", () => {
  let latest;
  let stopped = false;
  const unsubscribe = subscribeMediaControl((control) => { latest = control; });
  registerMediaControl({
    type: "radio",
    title: "Radio",
    isPlaying: true,
    toggle() {},
    stop() { stopped = true; },
  });

  stopActiveMediaControl();
  assert.equal(stopped, true);
  assert.equal(latest, null);
  unsubscribe();
});

test("a new playing media item replaces and stops the previous media owner", () => {
  let latest;
  let previousStopped = 0;
  const unsubscribe = subscribeMediaControl((control) => { latest = control; });
  const audioId = publishMediaControl({
    type: "audio",
    title: "Song",
    isPlaying: true,
    stop() { previousStopped += 1; },
  }, "audio");

  const videoId = publishMediaControl({
    type: "video",
    title: "Film",
    isPlaying: true,
    stop() {},
  }, "video");

  assert.equal(previousStopped, 1);
  assert.equal(latest.id, videoId);
  assert.notEqual(latest.id, audioId);
  stopActiveMediaControl();
  assert.equal(latest, null);
  unsubscribe();
});

test("media requests reach the persistent player surface immediately", () => {
  let received;
  let latest;
  const unsubscribe = subscribeMediaPlaybackRequests((control) => { received = control; });
  const unsubscribeState = subscribeMediaControl((control) => { latest = control; });
  const id = requestMediaPlayback({
    type: "youtube",
    title: "Culte",
    source: "youtube-id",
    isPlaying: true,
    stop() {},
  }, "youtube");

  assert.equal(received.id, id);
  assert.equal(received.source, "youtube-id");
  updateMediaControl(id, { currentTime: 12, duration: 90 });
  assert.equal(latest.currentTime, 12);
  unsubscribe();
  unsubscribeState();
  stopActiveMediaControl();
});

// Régression : la page Films republie le même contrôle vidéo (même propriétaire « video », même identifiant)
// avec toggle: null / seek: null ; le bouton lecture/pause du lecteur plein écran ne faisait alors plus rien.
test("republishing a video control erases the surface handlers, which must be re-attached", () => {
  let latest;
  const unsubscribe = subscribeMediaControl((control) => { latest = control; });
  const publish = (source) => requestMediaPlayback({ type: "video", title: "Film", source, isPlaying: true, toggle: null, seek: null, stop() {} }, "video");
  const id = publish("https://media.chay.fr/a.mp4");
  assert.equal(surfaceHandlersMissing(latest), true);
  updateMediaControl(id, { toggle() {}, seek() {} });
  assert.equal(surfaceHandlersMissing(latest), false);
  const again = publish("https://media.chay.fr/b.mp4");
  assert.equal(again, id);
  assert.equal(latest.toggle, null);
  assert.equal(surfaceHandlersMissing(latest), true);
  unsubscribe();
  stopActiveMediaControl();
});

test("surfaceHandlersMissing: radio needs only toggle, video and youtube also need seek", () => {
  assert.equal(surfaceHandlersMissing(null), false);
  assert.equal(surfaceHandlersMissing({ type: "radio", toggle() {} }), false);
  assert.equal(surfaceHandlersMissing({ type: "radio", toggle: null }), true);
  assert.equal(surfaceHandlersMissing({ type: "video", toggle() {}, seek: null }), true);
  assert.equal(surfaceHandlersMissing({ type: "youtube", toggle() {}, seek() {} }), false);
});
