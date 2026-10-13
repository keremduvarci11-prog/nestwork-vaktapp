import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agreedHourlyRate, calculateShiftPay, effectiveHourlyRate,
  normalizeShiftPayPatch, withHourlyRate,
} from "./shiftPay";

const shift = { startTid: "08:30", sluttTid: "16:00", betaltPause: true, beskrivelse: withHourlyRate("Småbarn", 205) };

test("three special shifts use 205; other shifts retain 195", () => {
  assert.equal(calculateShiftPay(shift, 195), 1537.5);
  assert.equal(Array.from({ length: 3 }, () => calculateShiftPay(shift, 195)).reduce((a, b) => a + b), 4612.5);
  assert.equal(calculateShiftPay({ ...shift, beskrivelse: "" }, 195), 1462.5);
  assert.equal(effectiveHourlyRate({ beskrivelse: "" }, "195.00"), 195);
});
test("paid hours and unpaid break still apply", () => {
  assert.equal(calculateShiftPay({ ...shift, betaltPause: false }, 195), 1435);
  assert.equal(calculateShiftPay({ ...shift, avtalteBetalteTimer: "6.25" }, 195), 1281.25);
});
test("rate supports comma, explicit zero, replacement and removal without destroying notes", () => {
  assert.equal(agreedHourlyRate({ beskrivelse: withHourlyRate(shift.beskrivelse, "207,25") }), 207.25);
  assert.equal(calculateShiftPay({ ...shift, beskrivelse: withHourlyRate("", 0) }, 195), 0);
  assert.equal(withHourlyRate(shift.beskrivelse, null), "Småbarn");
  assert.equal(withHourlyRate(shift.beskrivelse, 205), shift.beskrivelse);
});
test("invalid or ambiguous rates are rejected", () => {
  for (const value of [-1, "NaN", "200.001", "100000000", "abc"]) assert.throws(() => withHourlyRate("", value));
  assert.throws(() => agreedHourlyRate({ beskrivelse: "Avtalt timelønn: feil" }));
  assert.throws(() => agreedHourlyRate({ beskrivelse: shift.beskrivelse + "\n" + shift.beskrivelse }));
});
test("reassignment clears old employee's agreement, unless a new explicit agreement is provided", () => {
  const before = { ...shift, ansattId: "old" };
  assert.equal(normalizeShiftPayPatch(before, { ansattId: "new" }).beskrivelse, "Småbarn");
  const changed = normalizeShiftPayPatch(before, { ansattId: "new", avtalteTimelonn: 210 });
  assert.equal(agreedHourlyRate(changed), 210);
  assert.equal("avtalteTimelonn" in changed, false);
  assert.deepEqual(normalizeShiftPayPatch(before, { ansattId: "old" }), { ansattId: "old" });
  assert.deepEqual(normalizeShiftPayPatch({ ...shift, ansattId: null }, { ansattId: "new" }), { ansattId: "new" });
});
test("status/hour updates retain agreements and clearing rate restores normal pay", () => {
  assert.deepEqual(normalizeShiftPayPatch({ ...shift }, { beskrivelse: shift.beskrivelse }), { beskrivelse: shift.beskrivelse });
  const cleared = normalizeShiftPayPatch(shift, { avtalteTimelonn: null });
  assert.equal(calculateShiftPay({ ...shift, ...cleared }, 195), 1462.5);
});
