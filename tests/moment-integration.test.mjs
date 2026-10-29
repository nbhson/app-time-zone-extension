// Integration test: verifies DST + fractional-offset correctness using the
// exact moment/moment-timezone bundles the popup loads (UMD → require works).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dayDiff, formatOffsetDiff } from "../scripts/time-utils.js";

const require = createRequire(import.meta.url);

// moment-timezone UMD `require("moment")` — chưa có package node_modules,
// shim resolve 'moment' về bundle local giống thứ tự load trong popup.html.
const momentLib = require("../scripts/lib/moment.min.js");
const Module = require("node:module");
const origLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "moment") return momentLib;
  return origLoad.call(this, request, ...args);
};

require("../scripts/lib/moment-timezone-with-data.min.js");
const moment = momentLib;

test("half-hour offset zones compute correct local time", () => {
  // India +05:30 — không giờ lẻ nửa nào bị làm tròn sai
  const t = moment.tz("2026-06-15T00:00:00Z", "UTC").tz("Asia/Kolkata");
  assert.equal(t.format("HH:mm"), "05:30");
  assert.equal(t.utcOffset(), 330);
});

test("quarter-hour offset zones (Nepal +05:45)", () => {
  const t = moment.tz("2026-06-15T00:00:00Z", "UTC").tz("Asia/Kathmandu");
  assert.equal(t.utcOffset(), 345);
  assert.equal(t.format("HH:mm"), "05:45");
});

test("US DST spring-forward: offset jumps -5h -> -4h", () => {
  const before = moment.tz("2026-03-08T06:00:00Z", "UTC").tz("America/New_York"); // 01:00 EST
  const after = moment.tz("2026-03-08T07:00:00Z", "UTC").tz("America/New_York");  // 03:00 EDT
  assert.equal(before.utcOffset(), -300);
  assert.equal(after.utcOffset(), -240);
  assert.equal(before.format("HH:mm"), "01:00");
  assert.equal(after.format("HH:mm"), "03:00"); // 02:xx không tồn tại
});

test("US DST fall-back: offset jumps -4h -> -5h, diff label updates", () => {
  const summer = moment.tz("2026-07-01T12:00:00Z", "UTC").tz("America/New_York");
  const winter = moment.tz("2026-12-01T12:00:00Z", "UTC").tz("America/New_York");
  assert.equal(summer.utcOffset(), -240);
  assert.equal(winter.utcOffset(), -300);
  // Cùng khoảnh khắc, diff so với India đổi 30 phút qua DST
  const diffSummer = moment.tz("2026-07-01T12:00:00Z", "UTC").tz("Asia/Kolkata").utcOffset() - summer.utcOffset();
  const diffWinter = moment.tz("2026-12-01T12:00:00Z", "UTC").tz("Asia/Kolkata").utcOffset() - winter.utcOffset();
  assert.equal(formatOffsetDiff(diffSummer), "+9.5h");
  assert.equal(formatOffsetDiff(diffWinter), "+10.5h");
});

test("southern-hemisphere DST (Sydney) is opposite season", () => {
  const jan = moment.tz("2026-01-15T00:00:00Z", "UTC").tz("Australia/Sydney"); // AEDT +11
  const jul = moment.tz("2026-07-15T00:00:00Z", "UTC").tz("Australia/Sydney"); // AEST +10
  assert.equal(jan.utcOffset(), 660);
  assert.equal(jul.utcOffset(), 600);
});

test("date badge (+1d/-1d) via dayDiff across zones at same instant", () => {
  const base = moment.tz("2026-06-15T20:00:00Z", "UTC").tz("Asia/Ho_Chi_Minh"); // 03:00 Jun 16
  const tokyo = base.clone().tz("Asia/Tokyo");                                   // 05:00 Jun 16
  const la = base.clone().tz("America/Los_Angeles");                             // 13:00 Jun 15
  assert.equal(dayDiff(base.format("YYYY-MM-DD"), tokyo.format("YYYY-MM-DD")), 0);
  assert.equal(dayDiff(base.format("YYYY-MM-DD"), la.format("YYYY-MM-DD")), -1);
});

test("invalid zone names are rejected by moment.tz.zone (validation guard)", () => {
  assert.equal(moment.tz.zone("null"), null);
  assert.equal(moment.tz.zone(""), null);
  assert.ok(moment.tz.zone("Asia/Ho_Chi_Minh"));
});
