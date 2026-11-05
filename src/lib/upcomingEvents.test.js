import test from "node:test";
import assert from "node:assert/strict";
import { upcomingEvents } from "./upcomingEvents.js";

test("upcoming events are returned in meeting-date order, including multiple on the same day", () => {
  const events = [
    { id: "later", date: "2026-11-02", event_date: "2026-11-12", title: "Later" },
    { id: "same-day-b", date: "2026-11-01", event_date: "2026-11-08", title: "Same B" },
    { id: "earlier", date: "2026-11-02", event_date: "2026-11-05", title: "Earlier" },
    { id: "same-day-a", date: "2026-10-30", event_date: "2026-11-08", title: "Same A" },
  ];

  assert.deepEqual(
    upcomingEvents(events, "2026-11-02").map(({ id }) => id),
    ["earlier", "same-day-a", "same-day-b", "later"],
  );
});

test("events are excluded until their publication date and after the meeting date", () => {
  const events = [
    { id: "not-published", date: "2026-11-04", event_date: "2026-11-08" },
    { id: "past", date: "2026-10-30", event_date: "2026-11-01" },
    { id: "legacy", date: "2026-11-03" },
  ];

  assert.deepEqual(
    upcomingEvents(events, "2026-11-03").map(({ id }) => id),
    ["legacy"],
  );
});
