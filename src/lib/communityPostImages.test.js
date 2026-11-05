import test from "node:test";
import assert from "node:assert/strict";
import { communityPostImages } from "./communityPostImages.js";

test("community post images include the legacy image and remove duplicates", () => {
  assert.deepEqual(
    communityPostImages({
      image_urls: ["first.jpg", "second.jpg", "first.jpg", ""],
      image_url: "first.jpg",
    }),
    ["first.jpg", "second.jpg"],
  );
});

test("community post images support legacy-only posts", () => {
  assert.deepEqual(communityPostImages({ image_url: "legacy.jpg" }), ["legacy.jpg"]);
});

test("community post images ignore invalid values", () => {
  assert.deepEqual(communityPostImages({ image_urls: [null, 4], image_url: " " }), []);
});
