import assert from "node:assert/strict";
import test from "node:test";
import {
  isShiftEndReminderDue,
  osloDateTimeToDate,
  tomorrowDateInOslo,
} from "./cronTiming";

test("converts winter and summer shift times in Europe/Oslo", () => {
  assert.equal(
    osloDateTimeToDate("2026-01-15", "16:00").toISOString(),
    "2026-01-15T15:00:00.000Z",
  );
  assert.equal(
    osloDateTimeToDate("2026-07-15", "16:00:00").toISOString(),
    "2026-07-15T14:00:00.000Z",
  );
});

test("converts valid times on both sides of DST boundaries", () => {
  assert.equal(
    osloDateTimeToDate("2026-03-29", "01:30").toISOString(),
    "2026-03-29T00:30:00.000Z",
  );
  assert.equal(
    osloDateTimeToDate("2026-03-29", "03:30").toISOString(),
    "2026-03-29T01:30:00.000Z",
  );
  assert.equal(
    osloDateTimeToDate("2026-10-25", "01:30").toISOString(),
    "2026-10-24T23:30:00.000Z",
  );
  assert.equal(
    osloDateTimeToDate("2026-10-25", "03:30").toISOString(),
    "2026-10-25T02:30:00.000Z",
  );
});

test("handles repeated and skipped local times explicitly at DST changes", () => {
  assert.equal(
    osloDateTimeToDate("2026-10-25", "02:30").toISOString(),
    "2026-10-25T00:30:00.000Z",
  );
  assert.throws(
    () => osloDateTimeToDate("2026-03-29", "02:30"),
    /Local time does not exist/,
  );
});

test("calculates tomorrow from the Oslo calendar date around local midnight", () => {
  assert.equal(tomorrowDateInOslo(new Date("2026-01-15T23:30:00Z")), "2026-01-17");
  assert.equal(tomorrowDateInOslo(new Date("2026-07-15T22:30:00Z")), "2026-07-17");
});

test("calculates local tomorrow across both DST boundary weekends", () => {
  assert.equal(tomorrowDateInOslo(new Date("2026-03-28T23:30:00Z")), "2026-03-30");
  assert.equal(tomorrowDateInOslo(new Date("2026-10-24T22:30:00Z")), "2026-10-26");
});

test("keeps the 15-20 minute shift-end reminder window and excludes stale shifts", () => {
  assert.equal(
    isShiftEndReminderDue(new Date("2026-01-15T15:17:00Z"), "2026-01-15", "16:00"),
    true,
  );
  assert.equal(
    isShiftEndReminderDue(new Date("2026-07-15T14:17:00Z"), "2026-07-15", "16:00"),
    true,
  );
  assert.equal(
    isShiftEndReminderDue(new Date("2026-07-15T14:20:00Z"), "2026-07-15", "16:00"),
    false,
  );
  assert.equal(
    isShiftEndReminderDue(new Date("2026-07-16T14:17:00Z"), "2026-07-15", "16:00"),
    false,
  );
});