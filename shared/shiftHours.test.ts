import assert from "node:assert/strict";
import test from "node:test";
import { vaktPaidHoursPatchSchema } from "./schema";
import { calculatePaidHours, shouldDeductPause, hasPolicyPaidBreak, shiftPaidTerms, PAID_BREAK_EXEMPT_KINDERGARTEN_IDS } from "./shiftHours";

test("paid-break policy is inclusive, date-scoped and keyed by stable client IDs", () => {
  assert.equal(hasPolicyPaidBreak("2026-08-31", "ordinary-client"), false);
  assert.equal(hasPolicyPaidBreak("2026-09-01", "ordinary-client"), true);
  assert.equal(hasPolicyPaidBreak("2026-09-06", "ordinary-client"), true);
  assert.equal(hasPolicyPaidBreak("2026-09-07", "ordinary-client"), true);
  assert.equal(hasPolicyPaidBreak("2027-01-01", "ordinary-client"), true);
  assert.equal(hasPolicyPaidBreak("", "ordinary-client"), false);
  assert.equal(hasPolicyPaidBreak("2026-09-07", ""), false);
  for (const barnehageId of PAID_BREAK_EXEMPT_KINDERGARTEN_IDS) {
    assert.equal(hasPolicyPaidBreak("2026-09-01", barnehageId), false);
    assert.equal(hasPolicyPaidBreak("2026-09-07", barnehageId), false);
    const shift = { dato: "2026-09-07", barnehageId, startTid: "08:00", sluttTid: "13:30" };
    assert.deepEqual(shiftPaidTerms(shift), { betaltPause: false, trekkPause: true });
    assert.deepEqual(shiftPaidTerms({ ...shift, betaltPause: true }), { betaltPause: true, trekkPause: false });
    assert.equal(calculatePaidHours(shift.startTid, shift.sluttTid, {
      ...shiftPaidTerms({ ...shift, avtalteBetalteTimer: "6.25" }),
      avtalteBetalteTimer: "6.25",
    }), 6.25);
  }
});

test("write terms override legacy false but never rewrite clock times or agreed totals", () => {
  const shift = {
    dato: "2026-09-01", barnehageId: "ordinary-client",
    startTid: "08:30", sluttTid: "16:00",
    betaltPause: false, avtalteBetalteTimer: "7.00",
    timerGodkjent: true, lonnUtbetalt: true, status: "godkjent",
  };
  const updated = { ...shift, ...shiftPaidTerms(shift) };
  assert.equal(updated.betaltPause, true);
  assert.equal(updated.trekkPause, false);
  assert.equal(calculatePaidHours(updated.startTid, updated.sluttTid, updated), 7);
  assert.deepEqual({ ...updated, betaltPause: false, trekkPause: undefined }, { ...shift, trekkPause: undefined });
  assert.deepEqual(shiftPaidTerms({ ...shift, dato: "2026-08-31", avtalteBetalteTimer: null }), {
    betaltPause: false, trekkPause: true,
  });
});

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