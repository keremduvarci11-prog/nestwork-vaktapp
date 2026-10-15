import assert from "node:assert/strict";
import test from "node:test";
import type { Vakt } from "./schema";
import { compareWeeklyHours } from "./weeklyHours";

const shift = (dato: string, hours: number, status = "godkjent") => ({
  dato,
  startTid: "08:00",
  sluttTid: `${String(8 + hours).padStart(2, "0")}:00`,
  betaltPause: true,
  status,
}) as Vakt;

test("compares full Monday–Sunday weeks using approved paid hours only", () => {
  assert.deepEqual(compareWeeklyHours([
    shift("2026-10-05", 4),
    shift("2026-10-11", 4),
    shift("2026-10-12", 6),
    shift("2026-10-18", 6),
    shift("2026-10-19", 8),
    shift("2026-10-14", 8, "ledig"),
    shift("2026-10-14", 8, "tildelt"),
  ], "2026-10-15"), { currentHours: 12, previousHours: 8, percentChange: 50 });
});

test("handles decrease, unchanged totals and zero baseline without infinity", () => {
  assert.equal(compareWeeklyHours([shift("2026-10-05", 8), shift("2026-10-12", 4)], "2026-10-18").percentChange, -50);
  assert.equal(compareWeeklyHours([shift("2026-10-05", 8), shift("2026-10-12", 8)], "2026-10-15").percentChange, 0);
  assert.equal(compareWeeklyHours([], "2026-10-15").percentChange, 0);
  assert.equal(compareWeeklyHours([shift("2026-10-12", 8)], "2026-10-15").percentChange, null);
});

test("handles weeks spanning a year boundary and unpaid breaks", () => {
  const unpaid = { ...shift("2027-01-03", 8), betaltPause: false, trekkPause: true };
  assert.deepEqual(compareWeeklyHours([shift("2026-12-21", 5), unpaid], "2027-01-01"),
    { currentHours: 7.5, previousHours: 5, percentChange: 50 });
});
