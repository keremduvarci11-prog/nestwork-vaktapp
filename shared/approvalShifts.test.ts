import assert from "node:assert/strict";
import test from "node:test";
import type { Vakt } from "./schema";
import { approvalOpenShifts } from "./approvalShifts";

function shift(id: string, patch: Partial<Vakt> = {}): Vakt {
  return {
    id, dato: "2026-10-22", startTid: "08:00", sluttTid: "15:30",
    status: "ledig", ansattId: null, ...patch,
  } as Vakt;
}

test("includes all open shifts independently of requests and preserves separate identical orders", () => {
  const input = [shift("second"), shift("first"), shift("older", { dato: "2026-10-12" })];
  const original = [...input];
  assert.deepEqual(approvalOpenShifts(input).map(v => v.id), ["older", "first", "second"]);
  assert.deepEqual(input, original);
});

test("excludes filled shifts and other statuses even if request records remain", () => {
  assert.deepEqual(approvalOpenShifts([
    shift("open"),
    shift("assigned", { ansattId: "employee" }),
    shift("accepted", { status: "godkjent", ansattId: "employee" }),
    shift("offered", { status: "tildelt" }),
  ]).map(v => v.id), ["open"]);
});

test("sorts chronologically by date then start time", () => {
  assert.deepEqual(approvalOpenShifts([
    shift("late", { startTid: "09:30" }),
    shift("later-day", { dato: "2026-10-23", startTid: "07:00" }),
    shift("early", { startTid: "07:30" }),
  ]).map(v => v.id), ["early", "late", "later-day"]);
});
