import assert from "node:assert/strict";
import test from "node:test";
import { vaktPaidHoursPatchSchema } from "./schema";
import { calculatePaidHours, shouldDeductPause } from "./shiftHours";

test("ordinary shifts keep the automatic 30-minute pause rule", () => {
  assert.equal(shouldDeductPause("08:00", "13:30"), true);
  assert.equal(calculatePaidHours("08:00", "13:30"), 5);
  assert.equal(shouldDeductPause("08:00", "13:29"), false);
  assert.equal(calculatePaidHours("08:00", "13:29"), 5.483333333333333);
});

test("an explicit paid break keeps all worked time paid", () => {
  assert.equal(
    shouldDeductPause("08:00", "15:30", { betaltPause: true }),
    false,
  );
  assert.equal(
    calculatePaidHours("08:00", "15:30", { betaltPause: true }),
    7.5,
  );
});

test("agreed paid hours override duration without changing shift times", () => {
  const options = { betaltPause: true, avtalteBetalteTimer: "7.50" };
  assert.equal(shouldDeductPause("08:30", "16:00", options), false);
  assert.equal(calculatePaidHours("08:30", "16:00", options), 7.5);
});

test("agreed paid-hours input accepts decimals and rejects invalid values", () => {
  assert.deepEqual(
    vaktPaidHoursPatchSchema.parse({ betaltPause: true, avtalteBetalteTimer: "7,5" }),
    { betaltPause: true, avtalteBetalteTimer: 7.5 },
  );
  assert.equal(
    vaktPaidHoursPatchSchema.safeParse({ avtalteBetalteTimer: "-1" }).success,
    false,
  );
  assert.equal(
    vaktPaidHoursPatchSchema.safeParse({ avtalteBetalteTimer: "25" }).success,
    false,
  );
  assert.equal(
    vaktPaidHoursPatchSchema.safeParse({ avtalteBetalteTimer: "7.555" }).success,
    false,
  );
});