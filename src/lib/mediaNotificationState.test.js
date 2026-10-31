import assert from "node:assert/strict";
import test from "node:test";
import {
  createMediaNotificationState,
  dispatchMediaNotificationAction,
  shouldShowMediaNotification,
} from "./mediaNotificationState.js";

test("native media notification starts only for playback and remains available while paused", () => {
  assert.equal(shouldShowMediaNotification(null, false), false);
  assert.equal(shouldShowMediaNotification({ isPlaying: false }, false), false);
  assert.equal(shouldShowMediaNotification({ isPlaying: true }, false), true);
  assert.equal(shouldShowMediaNotification({ isPlaying: false }, true), true);
});

test("native notification state exposes artwork, metadata, progress, and queue controls", () => {
  assert.deepEqual(createMediaNotificationState({
    title: "Chanson",
    subtitle: "Artiste",
    artwork: "https://example.com/cover.jpg",
    isPlaying: true,
    isBuffering: true,
    currentTime: 7,
    duration: 100,
    previous: () => {},
    next: () => {},
  }), {
    title: "Chanson",
    artist: "Artiste",
    artworkUrl: "https://example.com/cover.jpg",
    isPlaying: true,
    isBuffering: true,
    currentTime: 7,
    duration: 100,
    isLive: false,
    hasPrevious: true,
    hasNext: true,
  });
  assert.equal(createMediaNotificationState(null), null);
});

test("native notification play and pause actions call the active media engine", () => {
  const calls = [];
  const control = {
    isPlaying: true,
    pause: () => calls.push("pause"),
    play: () => calls.push("play"),
  };
  dispatchMediaNotificationAction(control, "pause");
  dispatchMediaNotificationAction({ ...control, isPlaying: false }, "play");
  assert.deepEqual(calls, ["pause", "play"]);
});

test("native notification previous and next actions navigate the active queue", () => {
  const calls = [];
  const control = {
    previous: () => calls.push("previous"),
    next: () => calls.push("next"),
  };
  assert.equal(dispatchMediaNotificationAction(control, "previous"), true);
  assert.equal(dispatchMediaNotificationAction(control, "next"), true);
  assert.equal(dispatchMediaNotificationAction({}, "next"), false);
  assert.deepEqual(calls, ["previous", "next"]);
});

test("native notification stop action stops the active player", () => {
  let stopped = false;
  assert.equal(dispatchMediaNotificationAction({ stop: () => { stopped = true; } }, "stop"), true);
  assert.equal(dispatchMediaNotificationAction({}, "stop"), false);
  assert.equal(stopped, true);
});

test("native notification seek actions clamp to media duration", () => {
  const seeks = [];
  const control = { duration: 100, seek: (position) => seeks.push(position) };
  assert.equal(dispatchMediaNotificationAction(control, "seek", { position: 110 }), true);
  assert.equal(dispatchMediaNotificationAction(control, "seek", { position: -5 }), true);
  assert.equal(dispatchMediaNotificationAction(control, "seek", { position: "invalid" }), false);
  assert.deepEqual(seeks, [100, 0]);
});
