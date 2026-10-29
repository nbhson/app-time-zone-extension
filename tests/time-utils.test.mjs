// Node test-suite cho scripts/time-utils.js (pure helpers, không DOM).
// Chạy: npm test  (node --test tests/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  splitZone,
  normalizeQuery,
  formatOffsetDiff,
  dayCategory,
  dayDiff,
} from "../scripts/time-utils.js";
test("escapeHtml neutralises HTML metacharacters (XSS)", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("Tom & Jerry's"), "Tom &amp; Jerry&#39;s");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(42), "42");
});

test("splitZone handles simple, nested and single-segment zones", () => {
  assert.deepEqual(splitZone("America/New_York"), { city: "New York", region: "America" });
  assert.deepEqual(splitZone("America/Argentina/Buenos_Aires"), {
    city: "Buenos Aires",
    region: "America / Argentina",
  });
  assert.deepEqual(splitZone("UTC"), { city: "UTC", region: "" });
  assert.deepEqual(splitZone("Asia/Ho_Chi_Minh"), { city: "Ho Chi Minh", region: "Asia" });
});

test("normalizeQuery strips spaces, underscores and slashes (R2-6)", () => {
  assert.equal(normalizeQuery("Buenos Aires"), "buenosaires");
  assert.equal(normalizeQuery("America/Argentina/Buenos_Aires"), "americaargentinabuenosaires");
  assert.equal(normalizeQuery("  New_York / US "), "newyorkus");
  assert.equal(normalizeQuery(null), "");
});

test("formatOffsetDiff handles whole, half-hour and 45-min offsets", () => {
  assert.equal(formatOffsetDiff(0), "Same time");
  assert.equal(formatOffsetDiff(60), "+1h");
  assert.equal(formatOffsetDiff(330), "+5.5h");       // India +5:30
  assert.equal(formatOffsetDiff(-150), "-2.5h");      // -2:30
  assert.equal(formatOffsetDiff(45), "+0.75h");       // Nepal +5:45 diff
  assert.equal(formatOffsetDiff(-45), "-0.75h");      // Marquesas -9:30 vs -8:45...
  assert.equal(formatOffsetDiff(NaN), "Same time");
});

test("dayCategory buckets hours for meeting planner", () => {
  assert.equal(dayCategory(9), "work");
  assert.equal(dayCategory(12), "work");
  assert.equal(dayCategory(16), "work");
  assert.equal(dayCategory(7), "evening");
  assert.equal(dayCategory(8), "evening");
  assert.equal(dayCategory(17), "evening");
  assert.equal(dayCategory(21), "evening");
  assert.equal(dayCategory(0), "night");
  assert.equal(dayCategory(6), "night");
  assert.equal(dayCategory(22), "night");
  assert.equal(dayCategory(-1), "night");
  assert.equal(dayCategory(24), "night");
  assert.equal(dayCategory("9"), "work");
  assert.equal(dayCategory(NaN), "night");
});

test("dayDiff computes whole-day deltas across DST/leap boundaries", () => {
  assert.equal(dayDiff("2026-03-08", "2026-03-09"), 1);
  assert.equal(dayDiff("2026-03-09", "2026-03-08"), -1);
  assert.equal(dayDiff("2026-02-28", "2026-03-01"), 1);  // non-leap Feb
  assert.equal(dayDiff("2024-02-28", "2024-03-01"), 2);  // leap year 29 Feb
  assert.equal(dayDiff("2026-10-31", "2026-11-02"), 2);  // US DST ends Nov 1 2026
  assert.equal(dayDiff("bad", "2026-01-01"), 0);          // malformed input → 0
});
